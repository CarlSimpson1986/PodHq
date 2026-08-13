-- Adds a pipeline status to `leads` (previously a flat CSV-imported contact
-- list with no stage concept at all) for the new /leads page — mirrors
-- GymFlow's New Lead / Contacted / Trial columns.
--
-- No CHECK constraint — same "validate at the app layer, not the DB" rule
-- gym_outgoings.category already established (a hand-pasted multi-value
-- CHECK constraint in Supabase's SQL editor caused a real, hard-to-diagnose
-- outage there via smart-quote corruption). Validated instead via
-- z.enum(LEAD_STATUSES) in src/lib/validation/leads.ts.
--
-- Default 'new_lead' backfills every existing CSV-imported row cleanly —
-- no separate backfill statement needed.

alter table public.leads
  add column if not exists status text not null default 'new_lead';

create index if not exists leads_gym_status_idx on public.leads (gym, status);
