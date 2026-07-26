# PodHQ — Build Roadmap & Data Reference

Staged build order from the original project brief. Guide the user through each
stage step by step — explain what's about to be built and why, ask before
proceeding on anything that could go multiple ways, confirm each stage works
before moving to the next. Don't jump ahead to a later stage unprompted.

## Stages

1. **Project scaffold** — Next.js, Tailwind, Supabase client, PWA config, env setup. Done.
2. **Auth** — login, session middleware, MFA, lockout. Done. Hardened 2026-07-26: fixed the proxy blocking `/api/auth/*` mid-MFA-setup, a `router.push` hang after MFA verify, and a recovery-flow gap where Supabase's AAL2 requirement had no path through it for accounts with MFA already enrolled.
3. **Database helpers** — Supabase server-side client, typed queries against `Revenue`/`attendance`/`ad_spend`. Done, scoped to what Stage 4 needed rather than the full route surface up front: `src/lib/data/types.ts`, `src/lib/auth/gym-scope.ts`, `src/lib/data/dashboard.ts`.
4. **Dashboard home page** (`/dashboard`, admin view first). Done. Server component, no separate API route (direct data-layer calls — deliberate, since this page has no filters to trigger client-side re-fetching). Admin: all-gyms stat cards, revenue-by-gym bar chart, >10%-down alerts, per-gym ARPM breakdown (paying customers from `Revenue.sold_to`, not attendance — see Data pipeline below), a data-completeness flag on the Active Members card when a gym has zero attendance rows for the period, and a 12-month all-gyms revenue trend. Owner: their one gym's stat cards + 12-month trend chart. Deliberately does *not* have date-range selection (QTD/Last Quarter/YTD/year picker) — that's Stage 5's job, since it needs real multi-month aggregation and comparison logic, not just a different `report_month` lookup.
5. **Revenue analytics page** (`/revenue`) — **Pass 1 done 2026-07-26**: date-range presets (Last Month/QTD/Last Quarter/YTD/Full Year + year selector, replacing the plain "month picker" from the original spec — see Feature specs below), gym filter (admin only, owner locked to their own), total revenue with vs-previous-period and vs-same-period-last-year. Client-side filtering via `/api/revenue/summary` (first page-with-filters in the app — Stage 4 deliberately had none). Has `loading.tsx`/`error.tsx` and a visible loading indicator during filter changes. Title reflects the live gym selection (was a bug — the H1 was server-rendered from initial state only and went stale on filter change; moved into the client component). Verified live: QTD + Last Quarter sums exactly to YTD; a real owner test account confirmed the server ignores a manipulated `gym` query param and always returns their own gym's data regardless of what the client sends. **Pass 2 not started**: category pie (Memberships vs PAYG/Packs), category-split stacked area over time, monthly trend line w/ YoY overlay, top 10 products, top 10 customers.
6. **Member insights page** (`/members`) — not started. Includes LTV calculations.
7. **Outgoings / P&L** — not started, scoped 2026-07-26 (not in the original brief — came from the user's business partner). See Feature specs below.
8. **Marketing / ads upload page** (`/marketing`) — not started. CSV parsing (Meta Ads export + GymFlow leads export).
9. **Admin panel** (`/admin`, admin only) — not started. User management, system status.
10. **Owner role restrictions** — RLS policies already exist (`supabase/migrations/0001_core_schema.sql`) as defense-in-depth; this stage is the application-level filtering in each page/route.
11. **PWA finalisation** — manifest, icons, install prompt.
12. **Deploy to Vercel** — not deployed yet; dev only, `localhost:3000`.

## Database schema

Two tables pre-date this project and were never created by our migrations — they
came already populated from GymFlow. Everything else was created in
`supabase/migrations/0001_core_schema.sql`.

**`Revenue`** (capital R — quote in SQL: `public."Revenue"`)

| Column | Type | Notes |
|---|---|---|
| id | int8 | PK |
| gym | text | must match the gym list below exactly |
| date | timestamptz | transaction timestamp |
| item | text | product/service name |
| quantity_sold | int4 | |
| amount_inc_tax | numeric | revenue inc. tax, GBP |
| category | text | `MEMBERSHIP` or `CREDIT_PACK` — UI labels these "Memberships" / "PAYG / Packs" |
| sold_to | text | customer name — canonical from GymFlow, safe to use as a dedup key (see Data pipeline below) |
| report_month | text | `yyyy-MM` |
| created_at | timestamptz | |

**`attendance`** (lowercase)

| Column | Type | Notes |
|---|---|---|
| id | int8 | PK |
| gym | text | |
| user_member_id | uuid | GymFlow member ID |
| first_name / last_name | text | |
| attendance | int4 | visit count for the report month |
| last_attended | timestamptz | |
| report_month | text | `yyyy-MM` |
| created_at | timestamptz | |

**`ad_spend`** (app-managed) — `gym`, `week_starting` (date, Monday of the week), `spend_gbp`, `clicks`, `leads`, `uploaded_by`, `created_at`. CPC/CPL derived at query time, never stored.

**`users_gyms`** (app-managed) — maps `user_id` to `gym` (must match `Revenue.gym` exactly) and `role`. `role='admin'` has `gym = NULL` and bypasses gym filtering server-side; `role='owner'` has exactly one gym.

**Exact gym name strings** (used verbatim in `gym` columns, RLS policies, user assignments):

1. Aylesbury Berryfields
2. Basingstoke
3. Berkhamsted
4. Crewe
5. Fairford Leys
6. Hackney
7. Kingston upon Thames
8. Milton Keynes
9. Oxford East

## Data pipeline

**Supabase/PostgREST caps a single request at 1000 rows and truncates
silently past that — no error, just fewer rows than actually match.**
Confirmed 2026-07-26: an unpaginated query over 6 months of all-gym
`Revenue` returned exactly 1000 of 3,739 actual rows. A single month's
all-gym `Revenue` is already ~926 rows — close enough to the cap that it
will start truncating as the business grows, even for single-month
queries. **Every raw-row fetch against `Revenue`/`attendance` must page
through `.range()` until a partial page comes back** (see the loop pattern
in `src/lib/data/dashboard.ts` and `src/lib/data/revenue.ts`) rather than
assume one request returns everything — this bites hardest on multi-month
range queries (Stage 5's QTD/Last Quarter/YTD/Full Year), but don't assume
single-month queries are permanently safe either. `count: "exact", head:
true` queries (row counts, not row data) aren't affected by this cap.

All `Revenue`/`attendance` data is pulled directly from GymFlow and cleaned by
UiPath automation — nothing is manually typed. Two consequences:

- **The pipeline only ever backfills the prior completed month, never the
  current one.** Any date range or month picker must default to **last
  calendar month**, not the current one — "this month" reads as empty/zero by
  design, not a gap to work around or a bug to chase.
- **`sold_to` is a canonical, consistent customer identifier**, not free text
  prone to name-variant duplication ("John Smith" vs "J Smith"). Safe to use
  as a dedup/grouping key — used for the dashboard's per-gym ARPM (paying
  customers = distinct `sold_to`, across both `MEMBERSHIP` and `CREDIT_PACK`
  categories — restricting to `MEMBERSHIP` only would undercount regular
  pay-as-you-go customers and distort the metric) and will matter again for
  Stage 6's LTV calculations, which key on unique `sold_to` too.

**`Revenue` and `attendance` measure genuinely different things and must stay
separate metrics — don't unify them even where one is more complete than the
other.** `Revenue`/`sold_to` = who paid (financial engagement). `attendance` =
who actually showed up and how many times — visit *frequency*, and the gap
between paying and attending (pays but doesn't come in, or vice versa) is
itself a real signal (engagement drop / churn risk) that revenue data can't
see. Use `Revenue` for financial metrics (ARPM, revenue totals), `attendance`
for engagement/usage metrics (active members, at-risk members in Stage 6).

**Known gap:** Hackney and Crewe currently have zero `attendance` rows for
recent months despite having real `Revenue` — cause unknown as of 2026-07-26,
possibly a different door-entry setup at Hackney or a GymFlow sync issue,
user is asking their team. Not fixable by changing queries — an upstream
pipeline question. The dashboard surfaces which gyms are missing attendance
data for the period rather than silently producing a misleadingly low
aggregate.

**Future system change:** moving from Kisi to **PDK (ProdataKey)** for door
access, which will give proper day-to-day check-in/check-out timeseries
data — richer than the current monthly GymFlow attendance CSV. Worth
remembering when Stage 6 (Member Insights) gets built: don't over-invest in
working around the current CSV's limitations if PDK is coming.

## Feature specs (Stages 5-9)

**Revenue analytics (`/revenue`)** — filters: gym (admin only), date-range
presets (Last Month/QTD/Last Quarter/YTD/Full Year + year selector — done,
Pass 1), vs-previous-period and vs-same-period-last-year (done). Still to
build (Pass 2) — KPIs: category pie (Memberships vs PAYG/Packs),
category-split stacked area over time, monthly
trend line w/ YoY overlay, MoM growth %, avg revenue/transaction, top 10
products bar chart, top 10 customers table (rank, name, total, % of gym
revenue). Once this page exists, make the dashboard's revenue-by-gym bar
chart bars link through to it, filtered to that gym.

**Member insights (`/members`)** — filters: gym, month. KPIs: active members
(`attendance`>0), at-risk table (1-3 visits, colour-coded: 1=red, 2-3=amber),
top attenders, avg attendance/active member. LTV section: LTV per `sold_to`
(total spend, avg monthly spend × avg lifespan months), LTV distribution
histogram, top 20 LTV customers/gym, "affordable CAC" = LTV ÷ 3.

**Outgoings / P&L (Stage 7)** — a new `gym_outgoings` table (app-managed, not
GymFlow-sourced), owner-submitted per gym, admin can view all + has fallback
edit access (same oversight pattern as everything else — entry is owner-only,
visibility isn't). Suggested shape: `gym`, `category`, `amount_gbp`,
`effective_from` (month), `created_by`, `created_at` — a category's value
carries forward automatically to later months until the owner changes it, so
nobody re-enters unchanged figures like rent every month; look up "most
recent row at or before the target month" per category rather than requiring
a row for every period.

Fixed category list (owner picks from this, no free text, so figures stay
comparable across gyms — validated against real gym expense-structure data:
Staff ~38%, Facility ~30%, Equipment ~20%, Admin ~7%, Misc ~6%): **Rent/
Lease, Staff Wages, Utilities, Insurance, Equipment (purchase/maintenance),
Software/Subscriptions, Cleaning, Card/Merchant Processing Fees, Other.**
Deliberately excludes **Marketing** — that's already captured via `ad_spend`
(Stage 8), so the P&L calculation should pull marketing cost from there
automatically rather than risk an owner double-entering the same spend.

No overhead-allocation logic needed: MFP (the franchisor) is a separate
entity from each gym franchisee, so nothing MFP pays for (including this
software) is any individual gym's outgoing. A gym's P&L is simply that gym's
`Revenue` total minus that gym's `gym_outgoings` (+ its `ad_spend`) for the
period — no shared/allocated costs to split across gyms.

Visibility: owner sees their own gym's P&L; **admin sees per-gym P&L and a
franchise-wide consolidated view** — deliberately not owner-only. Real
industry precedent for this: a healthy consolidated P&L can mask a
struggling location if stronger units are carrying weaker ones, so admin
needs unit-level visibility, not just the total, to catch problems early.

**Marketing (`/marketing`)** — upload two CSVs (Meta Ads export, GymFlow leads
export). Meta CSV: sum `Amount spent (GBP)` + `Results` where
`Result indicator = actions:link_click`; `Reporting starts` = week
identifier. Leads CSV: row count = lead count. Parsed summary written to
`ad_spend`, shown for review. Dashboard: weekly spend trend, CPC trend, CPL
trend, LTV-vs-CAC ("Your average member is worth £X, you're spending £Y to
acquire one, ROI Z:1"), week-by-week table.

**Admin panel (`/admin`, admin-only)** — user management (list/create/
deactivate, assign gym+role), system status (last sync timestamp, row
counts/table), optional low-priority debug data view.

**Explicitly out of scope for v1**: push notifications, Stripe/billing
integration, churn rate (needs join/cancel dates GymFlow doesn't expose yet),
automated ad spend ingestion (manual CSV only), multi-language, light theme,
PDF/data export, gym-to-gym comparison for owners (cross-gym views are
admin-only).

**Non-functional**: dashboard <2s load (SSR initial data, client-side fetch
on filter change), PWA offline shell, WCAG 2.1 AA + colour-blind-safe chart
palette + data-table alternative for every chart, Chrome/Safari-iOS/Edge with
mobile Safari as primary target, GBP formatting throughout (2dp, thousands
separator).
