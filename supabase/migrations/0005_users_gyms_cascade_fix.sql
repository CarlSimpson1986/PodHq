-- 0001_core_schema.sql declared users_gyms.user_id as
-- `references auth.users(id) on delete cascade`, but `users_gyms` already
-- existed by the time that migration ran (create table if not exists is a
-- no-op against an existing table, constraints included), so the live
-- constraint was left as NO ACTION. Found 2026-07-29 while cleaning up a
-- throwaway test account: deleting directly from auth.users failed with a
-- foreign-key violation against users_gyms instead of cascading. Reconciles
-- the live schema with the documented intent — a deleted auth user should
-- never leave an orphaned users_gyms row behind.

alter table public.users_gyms
  drop constraint users_gyms_user_id_fkey,
  add constraint users_gyms_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
