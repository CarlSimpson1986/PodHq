-- Marketing CSV uploads (Stage 8) need to overwrite a re-uploaded week's
-- figures rather than duplicate them (e.g. correcting a bad upload) — an
-- upsert on (gym, week_starting) needs a unique constraint to target.

create unique index if not exists ad_spend_gym_week_key on public.ad_spend (gym, week_starting);
