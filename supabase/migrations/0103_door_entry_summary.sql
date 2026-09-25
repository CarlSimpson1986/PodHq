-- Aggregates door_entries (0102) for the /door-traffic page in one call —
-- the table runs to six figures of rows across all gyms, well past
-- PostgREST's 1,000-row page cap, so totals are computed here rather than
-- by paging raw rows into the server.
--
-- All bucketing is in UK local time. A "person" is the door-system email
-- (lowercased), falling back to the door system's own holder ID when a
-- holder has no email, so the same member at two Kisi gyms counts once.
-- "Visits" in `top` are distinct days with an entry — the same thing
-- GymFlow's attendance export counts, and immune to someone popping out
-- and back in.
create or replace function public.door_entry_summary(
  p_gym text,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with e as (
    select
      gym,
      outcome,
      holder_name,
      coalesce(nullif(lower(holder_email), ''), door_system || ':' || coalesce(holder_id, '')) as person,
      occurred_at at time zone 'Europe/London' as local_at
    from public.door_entries
    where occurred_at >= p_from
      and occurred_at < p_to
      and (p_gym is null or gym = p_gym)
  ),
  entries as (
    select * from e where outcome = 'entry'
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'entries', count(*) filter (where outcome = 'entry'),
        'denied', count(*) filter (where outcome = 'denied'),
        'people', count(distinct person) filter (where outcome = 'entry')
      )
      from e
    ),
    'series', coalesce((
      select jsonb_agg(s order by s.bucket)
      from (
        select
          to_char(date_trunc(p_bucket, local_at), 'YYYY-MM-DD') as bucket,
          count(*) filter (where outcome = 'entry') as entries,
          count(*) filter (where outcome = 'denied') as denied,
          count(distinct person) filter (where outcome = 'entry') as people
        from e
        group by 1
      ) s
    ), '[]'::jsonb),
    'heat', coalesce((
      select jsonb_agg(h)
      from (
        select extract(isodow from local_at)::int as dow, extract(hour from local_at)::int as hour, count(*) as entries
        from entries
        group by 1, 2
      ) h
    ), '[]'::jsonb),
    'by_gym', coalesce((
      select jsonb_agg(g order by g.entries desc)
      from (
        select
          gym,
          count(*) filter (where outcome = 'entry') as entries,
          count(*) filter (where outcome = 'denied') as denied,
          count(distinct person) filter (where outcome = 'entry') as people
        from e
        group by gym
      ) g
    ), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(t order by t.visits desc, t.last_visit desc)
      from (
        select
          max(holder_name) as name,
          string_agg(distinct gym, ', ') as gyms,
          count(distinct local_at::date) as visits,
          to_char(max(local_at), 'YYYY-MM-DD"T"HH24:MI') as last_visit
        from entries
        group by person
        order by visits desc, max(local_at) desc
        limit 25
      ) t
    ), '[]'::jsonb),
    'first_entry', (
      select min(occurred_at) from public.door_entries where p_gym is null or gym = p_gym
    )
  );
$$;

-- Service-role only. Supabase grants EXECUTE on new public functions to
-- anon/authenticated by default, which would expose member names to
-- anyone holding the anon key via /rest/v1/rpc.
revoke execute on function public.door_entry_summary(text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.door_entry_summary(text, timestamptz, timestamptz, text) to service_role;
