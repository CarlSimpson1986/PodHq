-- OWASP audit (2026-08-16) found checkRateLimit() (duplicated identically in
-- both podHq and podhq-client, same shared rate_limits table) doing a plain
-- SELECT then UPDATE — two concurrent requests in the same window could both
-- read request_count = 99, both pass the < LIMIT_PER_MINUTE check, and both
-- write back 100, letting a burst modestly exceed the intended cap.
--
-- increment_rate_limit() replaces that with one atomic statement: an
-- INSERT ... ON CONFLICT ... DO UPDATE that increments and returns the
-- post-increment count in the same round trip, using the existing
-- unique (user_id, route, window_start) constraint as the conflict target.
--
-- Safe to re-run: idempotent (create or replace), matching every migration
-- since 0001.
create or replace function public.increment_rate_limit(
  p_user_id uuid,
  p_route text,
  p_window_start timestamptz
) returns int
language sql
as $$
  insert into public.rate_limits (user_id, route, window_start, request_count)
  values (p_user_id, p_route, p_window_start, 1)
  on conflict (user_id, route, window_start) do update
    set request_count = public.rate_limits.request_count + 1
  returning request_count;
$$;
