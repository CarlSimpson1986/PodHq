-- Found 2026-09-25: delete_member_cascade (0097) is security definer with
-- no revoke, and Supabase grants EXECUTE on new public-schema functions to
-- anon and authenticated by default — so anyone with the public anon key
-- could call POST /rest/v1/rpc/delete_member_cascade and wipe any member.
-- The only legitimate caller is podHQ's staff delete route, which uses the
-- service-role client, so nothing else needs it.
revoke execute on function public.delete_member_cascade(bigint) from public, anon, authenticated;
grant execute on function public.delete_member_cascade(bigint) to service_role;
