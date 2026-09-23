-- One place for "delete a member and everything that references them" —
-- every table below was hand-discovered the hard way, one FK violation at a
-- time, deleting stuck test signups via the SQL editor. Keeping the list
-- here means the next member deletion (test account or a real GDPR erasure
-- request) never has to be re-derived from scratch. Cascade-delete FKs
-- (on delete cascade) aren't listed — the members row deletion handles
-- those automatically.
create or replace function public.delete_member_cascade(p_member_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workout_sets where exercise_id in (
    select id from public.workout_exercises where session_id in (
      select id from public.workout_sessions where member_id = p_member_id
    )
  );
  delete from public.workout_exercises where session_id in (
    select id from public.workout_sessions where member_id = p_member_id
  );
  delete from public.workout_sessions where member_id = p_member_id;
  delete from public.training_blocks where member_id = p_member_id;
  delete from public.check_ins where member_id = p_member_id;
  delete from public.food_log_entries where member_id = p_member_id;
  delete from public.habit_logs where member_id = p_member_id;
  delete from public.member_habits where member_id = p_member_id;
  delete from public.coach_profiles where member_id = p_member_id;
  delete from public.coach_conversations where member_id = p_member_id;
  delete from public.member_workout_manual_logs where member_id = p_member_id;
  delete from public.push_device_tokens where member_id = p_member_id;
  delete from public.push_subscriptions where member_id = p_member_id;
  delete from public.waitlist_entries where member_id = p_member_id;
  delete from public.promo_code_redemptions where member_id = p_member_id;
  delete from public.gift_vouchers where purchaser_member_id = p_member_id or redeemed_by_member_id = p_member_id;
  delete from public.pod_access_events where member_id = p_member_id;
  delete from public.bookings where member_id = p_member_id;
  delete from public.memberships where member_id = p_member_id;
  delete from public.notification_log where member_id = p_member_id;
  delete from public.leads where member_id = p_member_id;
  delete from public.credits where member_id = p_member_id;
  delete from public.members where id = p_member_id;
end;
$$;
