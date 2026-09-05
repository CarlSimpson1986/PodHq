# PodHQ — Build Roadmap & Data Reference

Staged build order from the original project brief. Guide the user through each
stage step by step — explain what's about to be built and why, ask before
proceeding on anything that could go multiple ways, confirm each stage works
before moving to the next. Don't jump ahead to a later stage unprompted.

> Full session-by-session build history lives in `ROADMAP_HISTORY.md`
> (not auto-loaded) — this file is just the condensed stage index + live
> reference tables. See CLAUDE.md's "Session handoff" section for the
> full write-up/update convention.

## Stage index

Full detail for each entry (bug, fix, live verification) is in `ROADMAP_HISTORY.md`.

1. **Scaffold** — Next.js/Tailwind/Supabase/PWA config. Done.
2. **Auth** — login/MFA/lockout/magic-link. Done; hardened for a CSP hydration bug and a shared Auth Site-URL misconfig.
3. **DB helpers** — Supabase server client, typed queries. Done.
4. **Dashboard** (`/dashboard`) — admin all-gyms + owner single-gym, stat cards, ARPM, 12mo trend. Done.
5. **Revenue** (`/revenue`) — presets, category charts, top products/customers, month drill-down (27). Done.
6. **Members** (`/members`) — active/at-risk/top attenders, LTV methodology + top-20. Done.
7. **Outgoings/P&L** (`/outgoings`) — fixed categories w/ carry-forward, admin consolidated view, other income (16). Done.
8. **Marketing** (`/marketing`) — CSV upload → `ad_spend`, CPC/CPL/LTV-CAC, per-gym Brevo sync (23). Done.
9. **Admin** (`/admin`) — user list, one-time-password owner creation, deactivate/delete (14). Done.
10. **Owner restrictions** — gym-scoping audit, all routes/pages. No gaps found (2026-08-02).
11. **PWA** — descoped 2026-08-06 to podhq-client; `next-pwa` removed.
12. **Deploy** — live at podhq.vercel.app. Two cert-error red herrings resolved.
13. **Admin PDF export** — per-gym P&L PDF for a date range. Done 2026-08-06.
14. **Permanent account deletion** (admin) — type-to-confirm UI, audit-logged, FK fix. Verified live.
15. **Pods backend** (`/pods`) — manual booking, per-gym capacity/hours. RPC verified; UI click-tested live 2026-08-22 (see Stage 19).
16. **Other income** — `gym_other_income`, feeds P&L + Revenue combined card, kept out of GymFlow Revenue.
17. **Staff refunds** — Stripe refund API, ledger corrected via `charge.refunded` webhook. Verified live 2026-08-14.
18. **`/pods`→"Access"** — live Kisi door-unlock log, 15s polling on today only.
19. **Member profiles + Calendar** — `/pods/members/[id]`, `/pods/calendar` (grid, slot detail, cancel). Book/detail/cancel flow verified live 2026-08-22.
20. **Light theme** — content area dark→light w/ WCAG fixes; sidebar reverted to black same day.
21. **Staff sell/comp + card-on-file + catalog** (`/setup`) — embedded Stripe Checkout, live `catalog_items` table.
22. **OWASP audit** — critical IDOR fix, Stripe idempotency, TOCTOU fix, atomic rate limiter, dep patches.
23. **Brevo + Resend config** (`/setup`, admin) — encrypted per-gym keys. Applied & verified 2026-08-16.
24. **Health check + tests** — `/api/health`, Vitest added, `resolveGym` duplication consolidated.
25. **Calendar redesign + gold-to-sidebar-only** — full/partial/empty slot states + waitlist count.
26. **Shared Auth Site-URL bug** — magic-link callback missing from allowlist. Fixed 2026-08-17.
27. **Revenue month drill-down** (`/revenue`) — GymFlow-style date-range dropdown. Verified live 2026-08-22.
28. **Setup gym pickers merged** — plus `SECRET_ENCRYPTION_KEY` missing from Vercel Production found & fixed.
29. **Stripe Connect — Hove pilot** — per-gym Connect accounts, direct charges. Verified live end-to-end 2026-08-20.
30. **Hove pricing catalog uploaded** — 22 items from real spreadsheet, combo pricing allocated proportionally.
31. **Hove hours set 6am–10pm** — Calendar grid made resource-aware (`visibleHours`).
32. **Combo memberships fixed** — was two linked items (broken by `memberships.member_id` unique), now one product via `credits_secondary`.
33. **Hove Founding Member offer** — permanent staff-granted 20%-off flag, cleared on cancellation. Discount verified live 2026-08-22.
34. **Promo code system** (renamed from "coupons" — collided with `gift_vouchers`) — gym-scoped codes, atomic `redeem_promo_code()` RPC. Live 2026-08-22.
35. **`members` table wiped clean** — all 24 rows were QA/test data; full FK-ordered wipe run live 2026-08-22 to reset for a fresh test pass.
36. **`cancel_booking()` window fixed 2hr→3hr** (`0046`, shared DB) — real GymFlow policy. Verified live 2026-08-30 (refund boundary confirmed both sides).
37. **Chat Questions + Help FAQ** (`/chat-questions`) — review queue for unanswered POD-chat questions. `0063`, live 08-26.
38. **Cross-gym PAYG booking + Access-log fix** — PAYG members can book/waitlist at any gym; fixed Access log filtering by home gym instead of where the event happened.
39. **Cross-gym booking for members** (`0064`) — `create_booking()`/`cancel_booking()` spend/refund a network top-up for subscribers. Live.
40. **Network credit scoped to gym packs; chat hardened** (`0065`) — PT/Recovery excluded via `network_eligible`. Both LLM chats got injection resistance.
41. **"Find a Professional" directory** (`/professionals`, `0066`) — admin PT profile CRUD + inquiries list, feeding podhq-client. Live 2026-08-28.
42. **Hypertrophy A/B/C workout templates** (`0067`) — keyed on `block_type`+`block_started_at`, not a block-row FK. Live.
43. **Blank first-time exercise weight** (`0068`) — drops `workout_sets.weight_target_kg` NOT NULL. Live.
44. **Daily activity level (`0069`) + `kettlebells` equipment type** — TDEE now occupational-activity-only. Verified live 2026-08-29.
45. **Daily habit checklist** (`0070`, shared DB) — `member_habits`/`habit_logs`, insert-only ticks. Live 2026-08-29 — "Today's Mission" built on podhq-client. `0082`: `member_habits.unit`; `0083`: `member_workout_manual_logs`.
46-48. **Custom-workout formats** (`0071`-`0073`) — rest field, AMRAP (`format`/`time_cap_seconds`/`rounds_completed`), Rounds-For-Time (`target_rounds`/`elapsed_seconds`). Stages 1-3 of podhq-client's CrossFit-style work. Live 2026-08-29 to 08-30.
49. **Coaching review** (podhq-client) — injury-keyword, RPE-scaling, block-gate & check-in-pain fixes. See its ROADMAP.md.
50. **HIIT interval timer + reps tally** (`0074`) — Stage 4 of custom formats. Live.
51. **Weekly weigh-in + measurements** (`0075`) — `member_body_measurements`, syncs `coach_profiles.weight_kg`. Live.
52. **Session history + workout stats** (podhq-client) — `/training/history`, fixed HIIT mislabel bug.
53. **Cardio equipment logging** (`0076`) — `/setup` names machines; `gym_cardio_equipment`/`member_cardio_logs`. Live.
54. **Full security audit, both repos** (`0077`) — 2 parallel deep audits; one real gap found (missing RLS) and fixed same day.
55. **Pod Assist** (`0078`) — owner/admin AI chat agent (tool-calling, never free-text SQL), floating widget, marketing-playbook tool, monthly digest cron. Verified live 2026-08-31 (fixed token-budget truncation, cron-auth bypass).
56. **Standalone Stripe for owned gyms + Stripe-fed Revenue** (`0084`) — Hove/Berryfields are Carl's own; encrypted key/webhook-secret on `/setup`; webhook writes real purchases into `Revenue`; current-month clamp lifted. Live.
57. **Booking credit double-spend race fixed** (`0086`) — create_booking()'s slot lock didn't cover one member's concurrent calls at different slots, letting 1 credit fund 2 bookings. Added per-member advisory lock, verified live. Same session: refund + 4 `sales.ts` Stripe calls lacked idempotency and used the wrong account for standalone gyms; fixed. Embedded-checkout sell flow still needs a client-side key fix — flagged.

## Database schema

Two tables pre-date this project and were never created by our migrations —
they came already populated from GymFlow (`Revenue`, `attendance`). Everything
else was created via migrations in `supabase/migrations/` — that folder is the
source of truth for exact DDL; the notes below are a reference summary, not a
substitute for reading a migration file when precision matters.

**Shared with `podhq-client`:** separate repo/deploy, same Supabase project —
its migrations (`0009_pod_booking.sql` onward: `members`, `credits`,
`bookings`, `gym_kisi_mapping`, `pod_access_events`, `memberships`,
`gift_vouchers`, etc.) live in this repo's `supabase/migrations/` folder. A
change to this shared DB needs noting on both sides — see its ROADMAP.md too.

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
7. Hove
8. Kingston upon Thames
9. Milton Keynes
10. Oxford East

## Auth pattern in server-side code

**Never query `users_gyms` (or any table) via the session-scoped client
relying on RLS as the actual authorization check — use the service-role
client after verifying the session separately.** RLS is defense-in-depth,
not the primary authorization path. Found 2026-07-26: `getGymScope` used
the session client and depended on RLS's `auth.uid()` check, which
transiently failed on a token-refresh timing gap, giving a real admin a
silent empty result indistinguishable from "no gym assigned." Fixed by
having `getGymScope` take just `userId` (verified by the caller via
`getUser()`) and query via `createAdminClient()` instead. Any new
data-layer function should do the same — verify the session once, then
query via the admin client, matching `src/lib/data/`.

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
  categories) and Member Insights' LTV calculations, which key on unique
  `sold_to` too.

**`Revenue` and `attendance` measure genuinely different things and must stay
separate metrics — don't unify them even where one is more complete than the
other.** `Revenue`/`sold_to` = who paid (financial engagement). `attendance` =
who actually showed up and how many times — visit *frequency*, and the gap
between paying and attending (pays but doesn't come in, or vice versa) is
itself a real signal (engagement drop / churn risk) that revenue data can't
see. Use `Revenue` for financial metrics (ARPM, revenue totals), `attendance`
for engagement/usage metrics (active members, at-risk members in Stage 6).

**Known, still-open gap:** Hackney and Crewe have had zero `attendance` rows
for some months despite real `Revenue` — cause unknown, an upstream
pipeline question, not fixable by changing queries.
Pages that aggregate attendance surface which gyms are missing data rather
than silently producing a misleadingly low aggregate. (A similar Aylesbury
Berryfields `Revenue` gap **was** resolved 2026-07-28 — upstream re-run,
confirmed not app-caused. Full notes in `ROADMAP_HISTORY.md`.)

**Future system change:** moving from Kisi to **PDK (ProdataKey)** for door
access — richer data than the current monthly GymFlow CSV. Don't
over-invest working around the CSV's limits.

## Feature specs — key fixed lists

Full original pre-build specs (Stages 5-9) are in `ROADMAP_HISTORY.md`.
Kept here — fixed lists a new feature must stay consistent with:

**Outgoings categories** (fixed, no free text, keeps figures cross-gym
comparable): Rent/Lease, Staff Wages, Utilities, Insurance, Equipment,
Software/Subscriptions, Cleaning, Card/Merchant Fees, Other. Excludes
**Marketing** — captured via `ad_spend` instead, to avoid double-entry.

**Out of scope for v1**: push notifications, churn rate, automated
ad-spend ingestion, multi-language, gym-to-gym owner comparisons. (Stripe
billing/light theme/PDF export were later built anyway.)

**Non-functional**: <2s dashboard load, WCAG 2.1 AA + colour-blind-safe
charts + data-table alternative for every chart, GBP formatting (2dp,
thousands separator) throughout.
