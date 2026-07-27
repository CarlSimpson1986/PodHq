-- gym_outgoings can now be deleted, not just inserted — an owner needs a
-- way to remove a genuine data-entry mistake (typo'd amount, wrong
-- category) rather than only ever adding a correcting row on top of it.
-- Same defense-in-depth pattern as the select/insert policies in 0002:
-- the app enforces the real gym-lock via createAdminClient() after
-- checking the session, this RLS policy just mirrors that at the DB level.

create policy delete_own_gym_outgoings on public.gym_outgoings
  for delete to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));
