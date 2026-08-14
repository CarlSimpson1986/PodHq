# PodHQ — Build Roadmap & Data Reference

Staged build order from the original project brief. Guide the user through each
stage step by step — explain what's about to be built and why, ask before
proceeding on anything that could go multiple ways, confirm each stage works
before moving to the next. Don't jump ahead to a later stage unprompted.

## Stages

1. **Project scaffold** — Next.js, Tailwind, Supabase client, PWA config, env setup. Done.
2. **Auth** — login, session middleware, MFA, lockout. Done. Hardened 2026-07-26: fixed the proxy blocking `/api/auth/*` mid-MFA-setup, a `router.push` hang after MFA verify, and a recovery-flow gap where Supabase's AAL2 requirement had no path through it for accounts with MFA already enrolled.

   **Hardened again 2026-08-01: login page never hydrating in production, misdiagnosed for a while as a Turnstile bug.** Symptom: the Sign in button was permanently stuck disabled — looked exactly like the CAPTCHA widget failing to load. Two earlier fix attempts targeted Turnstile directly (browser-extension interference, then `next/script`'s loader) and neither held up: the same failure reproduced in incognito (ruling out extensions) and with the PWA service worker forcibly unregistered (ruling that out too). The real cause was one layer up — the CSP header in `next.config.ts` had no nonce or `unsafe-inline`, so it silently blocked Next.js's own inline hydration scripts (the `__next_f.push` RSC payload) with zero CSP violation ever printed to console. The page looked perfect (fully server-rendered HTML) but had **zero React hydration anywhere on it** — no click handlers, no state updates — confirmed directly via missing `__react*` keys on DOM nodes. Turnstile was never the problem; it just happened to be the most visible casualty, since its widget also needs hydration to run. Found by building production locally (`next build && next start`, bypassing Vercel as a variable) and bisecting `next.config.ts`'s CSP header directly — adding `'unsafe-inline'` as a diagnostic instantly fixed hydration, confirming CSP as the actual layer. Fixed properly with Next's documented nonce + `strict-dynamic` pattern instead of shipping `unsafe-inline` (which would have reopened the exact XSS hole CSP exists to close): CSP is now generated per-request in `src/proxy.ts` with a fresh nonce, and — since a nonce only exists at request time — the previously statically-prerendered auth pages (`/login` and siblings, `/`) now render dynamically via `force-dynamic` on the root layout, a negligible cost for a low-traffic login flow. `turnstile-widget.tsx` also moved off `next/script` back to a plain `document.createElement`/`appendChild` script tag, after confirming `next/script`'s `afterInteractive` strategy only ever produced a `<link rel=preload>` and never the actual executing `<script>` tag on this Next.js version — a real, secondary bug, independent of the CSP issue and worth fixing regardless. Verified live: Turnstile shows Success, the Sign in button enables, and a direct DOM check confirmed genuine hydration (`__react*` keys present on event-handled elements, not just visually-correct static markup).
3. **Database helpers** — Supabase server-side client, typed queries against `Revenue`/`attendance`/`ad_spend`. Done, scoped to what Stage 4 needed rather than the full route surface up front: `src/lib/data/types.ts`, `src/lib/auth/gym-scope.ts`, `src/lib/data/dashboard.ts`.
4. **Dashboard home page** (`/dashboard`, admin view first). Done. Server component, no separate API route (direct data-layer calls — deliberate, since this page has no filters to trigger client-side re-fetching). Admin: all-gyms stat cards, revenue-by-gym bar chart, >10%-down alerts, per-gym ARPM breakdown (paying customers from `Revenue.sold_to`, not attendance — see Data pipeline below), a data-completeness flag on the Active Members card when a gym has zero attendance rows for the period, and a 12-month all-gyms revenue trend. Owner: their one gym's stat cards + 12-month trend chart. Deliberately does *not* have date-range selection (QTD/Last Quarter/YTD/year picker) — that's Stage 5's job, since it needs real multi-month aggregation and comparison logic, not just a different `report_month` lookup.
5. **Revenue analytics page** (`/revenue`) — **Pass 1 done 2026-07-26**: date-range presets (Last Month/QTD/Last Quarter/YTD/Full Year + year selector, replacing the plain "month picker" from the original spec — see Feature specs below), gym filter (admin only, owner locked to their own), total revenue with vs-previous-period and vs-same-period-last-year. Client-side filtering via `/api/revenue/summary` (first page-with-filters in the app — Stage 4 deliberately had none). Has `loading.tsx`/`error.tsx` and a visible loading indicator during filter changes. Title reflects the live gym selection (was a bug — the H1 was server-rendered from initial state only and went stale on filter change; moved into the client component). Verified live: QTD + Last Quarter sums exactly to YTD; a real owner test account confirmed the server ignores a manipulated `gym` query param and always returns their own gym's data regardless of what the client sends. **Pass 2 done 2026-07-26**: category pie (Memberships vs PAYG/Packs, donut with legend), category-split stacked area (last 12 months), monthly trend line with YoY overlay (this-year in accent, last-year de-emphasized/dashed — same convention as a stat-tile trend sparkline), top 10 products bar chart, top 10 customers table (rank/name/total/% of revenue), transaction count, average revenue/transaction. First multi-category chart in the app — validated a new 2-slot palette (`--series-membership` reuses the brand accent, `--series-credit-pack` is a new blue) against PodHQ's dark card surface: CVD ΔE 26.6/21.6, normal-vision ΔE 29.6, contrast 8.2:1, all comfortably clear; the one soft fail (accent's lightness sits above the generic categorical band) is a documented, deliberate exception for brand consistency — see the comment in `globals.css`. Verified live: category breakdown sums exactly to total revenue, top-10 customer percentages are sane, all figures match Stage 4's dashboard exactly for the same month.
6. **Member insights page** (`/members`) — done 2026-07-26. Filters: gym (admin only), month (prev/next stepper, capped at the last completed month). KPIs: active members, avg attendance/active member, at-risk table (1-3 visits, 1=red/2-3=amber), top 10 attenders — same data-completeness flag pattern as Stage 4 for gyms with zero attendance rows (Hackney/Crewe), extended here to also cover a single gym selected via the filter (not just admin's all-gyms view). LTV section — see "LTV methodology" below — average LTV, affordable CAC (LTV÷3), distribution histogram, top 20 LTV customers (shows a Gym column only when "All gyms" is selected). Verified live: Hackney (zero attendance) correctly shows 0 active members + the completeness warning while its LTV section still populates from Revenue, confirming the attendance/revenue separation holds even in the known gap case. Caught and fixed during testing: the at-risk table has no natural cap (254 entries for "All gyms" in the seed data) and being left unbounded stretched the whole grid row — including the much shorter Top attenders card beside it — to match; fixed with a `max-h-96 overflow-y-auto` scroll container and a count in the heading.

   **"Last active" / "last purchase" columns (added 2026-07-26, same-day follow-up):** user manually cross-checking the Top 20 LTV table against real business knowledge caught "Func Fitness" ranking rank 6 despite having left the business long ago — a direct, concrete illustration of the LTV methodology's documented blind spot (no cancellation date, so a churned customer's historical value still shows up at full weight). Fix: added a "Last active" column (most recent `report_month` with any Revenue row) to the Top 20 LTV table, a "Last visited" column (`attendance.last_attended`) to the at-risk table, and a "Last purchase" column to Revenue's Top 10 customers table (Stage 5) for the same reason — a top-10 spot within a date range can come from one early purchase with nothing since. None of these try to *guess* who's churned; they just surface the raw recency fact so a human can judge it themselves. Verified live: Func Fitness showed "Last active: Sept 2024" and Tracy Lamond "Aug 2024" — both obviously stale next to genuinely current customers showing the latest month — confirming the column does exactly the job it was added for.

   **Top 20 LTV list filtered to recently-active customers (added 2026-07-26, same-day follow-up):** the "Last active" column above surfaces staleness but doesn't fix the actual problem — a list meant to answer "who should I focus on right now" still had long-gone customers cluttering it. Resolved by distinguishing the list's *display* from the underlying *calculation*: the Top 20 table now only shows customers active within a rolling 3-month window (deliberately generous — a PAYG/credit-pack customer can go 6-8 weeks between pack purchases without having churned, unlike a monthly membership customer who'd show a new Revenue row every month if still subscribed), anchored to the last completed month regardless of the page's month filter (same as the rest of the LTV section). Average LTV, affordable CAC, and the cohort average-lifespan multiplier all deliberately keep using *every* customer who's ever paid, churned or not — a churned customer's full observed lifespan is real data that's part of what makes "average lifespan" meaningful, so only the displayed list changes, not the maths behind it. Verified live: Func Fitness and Tracy Lamond dropped out of the Top 20 entirely (replaced by genuinely recent customers), while Average LTV (£57.13) and Affordable CAC (£19.04) stayed exactly unchanged — confirming the filter only touches the list, not the aggregate calculation.

   **LTV methodology (decided 2026-07-26, before building):** LTV = a customer's own avg monthly spend × their *gym's* average customer lifespan (in active months), not the customer's own lifespan — using an individual's own lifespan makes the multiplication collapse straight back to their raw total spend, which would make "affordable CAC = LTV÷3" meaningless. "Active months" = distinct `report_month`s with any Revenue row, not the calendar span (a customer who paid Jan/Feb/Mar/May/Jun has 5 active months, not 6). Because there are no cancellation/join dates (out of scope until PDK), average lifespan is really "average active-months observed so far," which understates a still-active customer's true lifespan — the whole figure is a **conservative floor, never an overstatement**, and that's an intentional, documented tradeoff, not a gap to fix by e.g. guessing at churn. Verified live: the per-gym LTV/avg-monthly-spend ratio is stable across every customer within the same gym (e.g. every Basingstoke customer's LTV was exactly 2.605× their avg monthly spend), confirming the per-gym multiplier is applied consistently.
7. **Outgoings / P&L** (`/outgoings`) — done 2026-07-27 (scoped 2026-07-26, not in the original brief — came from the user's business partner). See Feature specs below for the full spec; built as designed, with two changes made live during the build:

   **`category` not DB-constrained (found while applying the migration, 2026-07-27):** the original plan put a `check (category in (...))` constraint on `gym_outgoings.category`. Applying it broke PostgREST for this table in a very specific, reproducible way — `HEAD` requests succeeded but every row-returning query failed with `PGRST205` ("could not find the table in the schema cache"), for every query shape tried, immediately and consistently, not intermittently. Read at the time as Supabase infrastructure flakiness (multiple backend pods out of sync) and chased for over an hour — project restart, manual `NOTIFY pgrst, 'reload schema'`, the lot — before the real cause surfaced: the SQL Editor's paste path was silently converting straight quotes to typographic "smart" quotes, corrupting both the check constraint's string literal and, separately, the quoted multi-word policy names, in a way that left Postgres reading an unterminated token until end-of-input. The infra-flakiness diagnosis was a plausible-sounding wrong turn, not the real fix. Fixed by dropping the DB-level enum entirely — `category` is validated by `z.enum(OUTGOING_CATEGORIES)` in `src/lib/validation/outgoings.ts` before every insert, which was always the real guard; the DB constraint was redundant defense-in-depth, not load-bearing — and by switching policy names to plain unquoted identifiers, which have no quote characters left for anything to mangle. Same lesson as the Stage 2 auth-debugging history above: don't accept an environmental/infrastructure explanation for a deterministic, 100%-reproducible failure without checking the actual query/DDL first.

   **Delete added (2026-07-27, same-day follow-up):** the original design was append-only — "changing" a value meant inserting a new row with a later `effective_from`, matching every other table in this app. First live use (the user testing their own account) immediately surfaced the gap: no way to remove an outright data-entry mistake, only to correct it going forward while the wrong row stayed in history forever. Added `deleteOutgoing` + `DELETE /api/outgoings/[id]`, gym-locked the same way insert already was (owner: own gym only; admin: fallback access to whichever gym is selected), plus a matching RLS delete policy (`supabase/migrations/0003_gym_outgoings_delete.sql`). Verified live: an entry entered from the real admin account, then deleted via the actual route (not a direct DB write) — gym's outgoings total and the consolidated total both dropped by exactly the deleted amount.

   Verified live throughout: revenue side of the P&L matched the Revenue page's monthly total exactly (£23,806.69, all gyms, Jun 2026); per-gym P&L rows summed exactly to the consolidated row; carry-forward logic confirmed by entering Rent/Lease at two different rates with different effective months and stepping the page back before/after the change date — each month correctly showed whichever rate was in effect at that point, not just the latest.
8. **Marketing / ads upload page** (`/marketing`) — done 2026-07-28. CSV parsing (Meta Ads weekly "Ad sets" export + GymFlow leads export) into `ad_spend`, upsert-on-reupload, weekly spend/CPC/CPL charts, LTV-vs-CAC card reusing Member Insights' LTV calculation, week-by-week table. Built across an earlier session (scaffold — parse logic, data layer, API routes, components) and finished/verified in this one.

   **Found and fixed: `0004_ad_spend_upsert.sql` had never been applied to the live DB.** `upsertAdSpend()` upserts on `(gym, week_starting)`, but without the matching unique index Postgres has no conflict target — every save would have failed with "no unique or exclusion constraint matching the ON CONFLICT specification". Caught by probing the live DB directly (an upsert attempt errored) before any live UI testing even started, not by reading the code. Fixed by running the migration's `create unique index` statement via the SQL Editor; re-verified afterward that two upserts on the same key correctly leave one row with the second write's values (overwrite, not duplicate).

   Verified live as **admin**: `/marketing` correctly shows the "All gyms" summary with no upload form until a specific gym is selected (no single gym to attribute an upload to otherwise); selecting Milton Keynes surfaces the form and switches the LTV figure to that gym's own average. Uploaded a real two-file test (Meta CSV with a mixed ISO/short date, GymFlow leads CSV with DD/MM/YYYY+time) through the actual UI — parse preview correctly normalized both to Monday-starting weeks and merged them (6 Jul: £150.25/42 clicks/2 leads, 13 Jul: £175.50/55 clicks/1 lead); confirm-and-save round-tripped through the real API, and every derived figure checked out by hand (CPC, CPL, totals, ROI multiple). Test rows deleted afterward.

   Verified live as **owner** (Milton Keynes test account): no gym selector shown, page auto-locked to Milton Keynes. Tampering test — same pattern as Stage 5's revenue-summary check — sent both `/api/marketing/summary?gym=Aylesbury Berryfields` and a POST to `/api/marketing/upload` with `gym: "Aylesbury Berryfields"` in the body from the owner's authenticated session: the GET ignored the query param and returned Milton Keynes data (`role: "owner"` in the response), and the POST's spoofed `gym` field was silently overridden — the row landed in the DB tagged `gym: "Milton Keynes"`, `uploaded_by` the owner's own user ID, not Aylesbury Berryfields. Confirmed directly against the table, not just the 200 response. Test row deleted afterward.
9. **Admin panel** (`/admin`, admin only) — **built 2026-07-28, partially verified live, not fully confirmed.** User management (list, invite-to-create an owner, deactivate/reactivate) + system status (row counts per table, last sync). Deliberate scope decisions: admin accounts are *not* creatable from this UI — only owner accounts — the most privileged role stays a manual out-of-band step; "deactivate" bans the Supabase Auth account outright (via `ban_duration`) rather than just removing the `users_gyms` row, so reactivating restores exact prior gym/role instantly; "last sync" is `MAX(created_at)` across `Revenue`/`attendance` (a proxy for last DB write, not a true upstream export timestamp — there's no dedicated sync-log). Creating an owner originally reused the existing invite → `/auth/callback` → `/login/set-password` flow from Stage 2 — since replaced entirely, see the 2026-08-01 note below. Self-deactivation is blocked server-side (`/api/admin/users/[id]` rejects a target id matching the caller's own).

   **Verified live:** system status row counts (Revenue 18,390 / attendance 821 / users_gyms 13 / ad_spend 2 / gym_outgoings 4) matched a direct DB query exactly. The create-owner route was confirmed to correctly reach Supabase's real invite API — tested with a `@example.com` address, which Supabase itself rejected (`email_address_invalid`, since `inviteUserByEmail` actually attempts delivery, unlike the plain `admin.createUser()` used for existing test accounts) — a real, expected validation failure, not a bug, but it means the happy path wasn't exercised.

   **Verified live 2026-07-29:** deactivate/reactivate confirmed end-to-end against the real Supabase Auth record, not just the UI — `banned_until` set to the documented ~100-year indefinite-ban value on Deactivate, cleared back to `null` on Reactivate, gym/role untouched throughout. Owner-role tamper test confirmed: an authenticated owner session hitting `/api/admin/users` (GET + POST) and `/api/admin/status` directly all returned `403 {"status":"error","message":"Admins only."}` — same pattern as the Stage 5/8 checks. The `/admin` page itself also correctly redirects an owner back to `/dashboard` on direct navigation.

   **Fixed 2026-07-29: `/admin` no longer appears in the sidebar nav for owner accounts.** Was cosmetic/client-side only (the page and both API routes already correctly blocked access), but invited exactly the kind of poking-around the tamper test above exercises. `AppShell` now takes a `role` prop and filters the nav item list; every page passing `<AppShell>` already had `scope.role` available, so this was a mechanical threading fix across 8 call sites, not a redesign.

   **Invite email deliverability — unresolved, needs attention before relying on this for real onboarding:** sent a real invite to `carlsimpson83+podhqtest@yahoo.co.uk` — Supabase Auth logged a clean `mail.send` (type `invite`, no error), but nothing arrived in Yahoo inbox or spam. A follow-up password-recovery send to the same project 10 minutes later was explicitly rejected with `429 over_email_send_rate_limit` — confirms the project is on Supabase's shared/default mailer, which enforces a very tight quota (project's Rate Limits page shows 2 emails/hour) — but one send shouldn't exhaust a 2-per-hour bucket, and what consumed the first slot wasn't identified. Root cause not fully confirmed either way (rate-limiting vs. Yahoo silently dropping mail from `noreply@mail.app.supabase.io`'s shared sending reputation are both plausible); the fix regardless is configuring custom SMTP (Resend/Postmark/etc.) under Auth → Emails before depositing real owners' onboarding on this path.

   **Valid fallback confirmed for onboarding real owners in the meantime:** an admin can create the Supabase Auth user directly (dashboard → Authentication → Add user → Create new user, with a password set directly and "Auto confirm" ticked — no email involved) and add the matching `users_gyms` row (gym + `role='owner'`) via SQL/Table Editor. The owner then logs into PodHQ's normal `/login` exactly as they would via the invite flow — same session, same gym-scoping, same RLS — the only difference is who sets the password (the admin, upfront, vs. the owner via an emailed link). Not a UI feature, just a documented manual path for when email delivery can't be relied on.

   **Fixed 2026-07-29 (unrelated to Stage 9 itself):** confirmed via `pg_constraint` that `users_gyms_user_id_fkey` was actually `NO ACTION` on the live DB (`confdeltype = 'a'`), not `CASCADE` as `0001_core_schema.sql` claimed — `create table if not exists` is a no-op against an already-existing table, so the constraint drift was silent. `supabase/migrations/0005_users_gyms_cascade_fix.sql` drops and recreates it with `on delete cascade`; re-verified after applying (`confdeltype = 'c'`). `auth_events_user_id_fkey` is also `NO ACTION` and was *deliberately* left that way — cascading an audit trail on user deletion would destroy history you'd want to keep; only `users_gyms` needed the fix.

   **Invite email replaced entirely (2026-08-01), resolving the deliverability problem above rather than chasing it further.** `createOwnerAccount` no longer calls `inviteUserByEmail` — it calls `admin.createUser({ email, password, email_confirm: true })` with a generated one-time password, and the admin UI (`CreateOwnerForm`) displays that password directly with a Copy button for the admin to send themselves, however they choose. PodHQ never sends anything. `app_metadata.must_change_password` gates the new owner into `/login/set-password` on first login — same enforcement point in `src/lib/supabase/middleware.ts` as every other auth gate. Verified live end-to-end with a throwaway `@example.com` test account: confirmed directly against Supabase that `email_confirmed_at` was set and both `invited_at`/`confirmation_sent_at` were empty (no email ever attempted, not just none arriving); logged in with the generated password, went through forced password change and MFA enrolment, landed on `/dashboard` correctly scoped to the assigned gym only (no gym selector, no Admin nav item); test account and its `auth_events` rows deleted afterward (the latter needed deleting first — same `NO ACTION` FK noted directly above blocked `deleteUser` until those rows were cleared). The manual Supabase-dashboard fallback documented above is now the exception path only (e.g. fixing a mistake outside the UI) — the one-time-password flow is the normal path for onboarding a real owner, and the shared-mailer rate-limit problem no longer applies since no invite email is ever sent.
10. **Owner role restrictions** — RLS policies already exist (`supabase/migrations/0001_core_schema.sql`) as defense-in-depth; this stage is the application-level filtering in each page/route. **Audited 2026-08-02: no gaps found.** Most of the enforcement had already happened piecemeal as each stage shipped (Stages 5, 8, 9 each live-tested an owner session against a manipulated `gym` param), but this was the first dedicated pass across the whole app. Checked every one of the 24 API routes and 13 pages: each verifies the session, derives scope via `getGymScope` (admin client, no RLS dependency), and for `role === "owner"` overrides any client-supplied `gym` with `scope.gym` rather than trusting it — writes/deletes additionally filter by `gym` at the DB layer too (e.g. `deleteOutgoing`), not just at the route level. The customer-profile page (`/members/customer/[gym]/[name]`) also checks the URL's gym segment against `scope.gym` and blocks a mismatch outright. Client-side, every gym-selector component (`revenue-summary-view`, `member-insights-view`, `customer-directory-view`, `marketing-view`, `outgoings-view`) hides the selector entirely for owners, and `AppShell` hides the Admin nav item for non-admins. Every app table (`Revenue`, `attendance`, `users_gyms`, `ad_spend`, `gym_outgoings`, `gym_outgoing_transactions`, `leads`, `auth_events`, `rate_limits`) has RLS enabled; `auth_events`/`rate_limits` deliberately have zero policies, which correctly denies all client-side access by default since only the service-role client ever touches them.
11. **PWA finalisation — descoped 2026-08-06.** Originally planned as manifest/icons/install-prompt for this app, but PWA behaviour (installable, offline shell) belongs to `podhq-client` (the member-facing pod-booking + Kisi unlock app — see its own ROADMAP.md), not the admin/owner analytics dashboard built here. `@ducanh2912/next-pwa` had been scaffolded into `next.config.ts` back at Stage 1 and was still generating `public/sw.js`/`workbox-*.js` at build with no manifest or icons ever added — removed entirely (package uninstalled, `next.config.ts` reverted to plain config, the now-dead `manifest.webmanifest`/`sw.js`/`workbox-`/`icons/` exclusions dropped from `proxy.ts`'s matcher, `.gitignore` entries removed). No further work planned here; this stage is closed, not deferred.
12. **Deploy to Vercel** — done 2026-08-02. Live in production at `https://podhq.vercel.app` (project `carl-simpsons-projects-b06f1b22/podhq`, no custom domain configured yet — cert is Vercel's shared `*.vercel.app` wildcard). Deployed via `vercel --prod` after a clean local `next build`. Same day, added an admin-only "Reset password" action (`/api/admin/users/[id]/reset-password`, generates a new one-time password and re-forces `must_change_password`, same pattern as `createOwnerAccount`) and a second admin account (`admin@myfitpod.co.uk`) for a second person to operate independently — each admin account has its own MFA enrolment (TOTP is per-account, not shareable across devices/phones); confirmed live that a `net::ERR_CERT_COMMON_NAME_INVALID` one tester hit was that person's work-network content filtering intercepting `*.vercel.app`, not a real certificate problem (the actual served cert checked out fine via `openssl s_client`) — expected to work normally off that network.

    **Second, unrelated `ERR_CERT_COMMON_NAME_INVALID` cause found 2026-08-10 — don't assume it's always the network-filtering issue above.** User hit the same Chrome error on both a work network and, when asked to rule out the network, their own personal (non-MDM) phone on mobile data — ruling out both network- and device-level interception this time, since neither carried over. Actual cause: the URL had a `www.` prefix (`www.podhq.vercel.app`). Vercel's wildcard cert is `*.vercel.app`, which only covers one label deep — it matches `podhq.vercel.app` but not `www.podhq.vercel.app`, and that hostname does resolve (to the same Vercel edge network) so the browser gets a real SNI/cert mismatch, not a blocked connection. Confirmed directly: `curl` to the `www.` host fails with `SEC_E_WRONG_PRINCIPAL`, the bare host doesn't. Fix is just dropping `www.` — the correct URL is `https://podhq.vercel.app`. No custom domain is set up (still true as of this date), so this will keep happening to anyone whose browser/bookmark auto-prepends `www.` to a bare domain.
13. **Admin PDF export** (`/admin` → "Export reports" card, not in the original brief) — done 2026-08-06. Downloads a single gym's P&L (revenue, outgoings by category, ad spend, net) as a PDF for a date-range preset (same Last Month/QTD/Last Quarter/YTD/Full Year shape as `/revenue`), with itemised transaction detail grouped by category for any outgoings that came in via bank-statement import — intended use is sharing real figures with a prospective franchisee without giving them a login. Admin-only route (`/api/admin/export/outgoings-pdf`), built on `@react-pdf/renderer`; reuses `getPnlFiguresForRange`/`getOutgoingTransactionsForRange` (range equivalents of the existing single-month P&L functions) rather than a separate calculation path. Verified live 2026-08-06: downloaded a real PDF for Aylesbury Berryfields, Apr–Jun 2026 — opened correctly, figures present, itemised transactions grouped under their categories as designed.

    **Also built same session, not yet verified: Brevo lead sync.** Marketing CSV upload (`/api/marketing/upload`) now also pushes newly-uploaded leads into a per-gym Brevo contact list (`src/lib/marketing/brevo.ts`) via `syncLeadsToBrevo`, so a gym's nurture-email workflow in Brevo picks them up automatically. Best-effort/silent by design — no `BREVO_API_KEY` is set yet, and only Aylesbury Berryfields has a list ID mapped (`GYM_BREVO_LIST_IDS`), so this is currently a no-op in practice, not a live feature. Needs the API key added to `.env.local`/Vercel env and the remaining 8 gyms' list IDs filled in before it does anything, then a real upload should be verified against Brevo's contact list directly (not just a 200 response) before relying on it.

14. **Admin panel: permanent account deletion** (not in the original brief) — done 2026-08-06. Deactivate/reactivate (Stage 9) bans the Supabase Auth account but never removes it, so its email stays permanently unavailable for re-adding the same franchisee later — the actual gap this closes. Admin-only, owner-role targets only (same asymmetry as `createOwnerAccount` — admin accounts are never creatable *or* deletable from this UI, staying a manual out-of-band step), self-delete blocked, same pattern as every other row in `/api/admin/users/[id]`. `deleteUserAccount` (`src/lib/data/admin.ts`) logs an `admin_account_deleted` audit event *before* calling `admin.auth.admin.deleteUser` — once the auth user is gone, no future `auth_events` row can carry its `user_id` (the FK needs the referenced row to still exist at insert time), so logging after would silently lose the record of who did it. `users_gyms` cascades automatically on delete (already fixed by `0005_users_gyms_cascade_fix.sql`); UI is a type-the-email-to-confirm inline panel in `UserList` (`src/components/admin/user-list.tsx`), not a plain `confirm()`, given it's irreversible and higher-stakes than the existing reset-password/deactivate actions that do use one.

    **Required `supabase/migrations/0011_auth_events_set_null_on_delete.sql`, applied 2026-08-06.** `auth_events.user_id` defaulted to `NO ACTION` on delete (same class of bug as `users_gyms` had before 0005 — `create table if not exists` never picked up the intended `on delete` clause), so `deleteUser` would otherwise fail outright with a foreign-key violation for any real account. Switches it to `on delete set null` instead of cascading the delete — preserves the audit trail's `event_type`/email/timestamp history rather than erasing it, only detaching it from the now-gone account, consistent with the documented principle in 0005's own note ("cascading an audit trail on user deletion would destroy history you'd want to keep"). First apply attempt hit a syntax error (`drop constraint` with no preceding `alter table` — a paste into the SQL Editor lost the leading line); split into two self-contained `alter table` statements and re-applied successfully.

    **Verified live 2026-08-06, two passes.** First pass was mechanism-only — a throwaway script hitting the same Supabase Admin API calls `deleteUserAccount` makes end-to-end (create test owner + simulated `login_success` auth_events row, delete, confirm no FK violation, confirm `users_gyms` cascaded, confirm the `auth_events` row survived with `user_id` nulled, confirm the email was reusable) — but that skipped the actual UI, which the user flagged directly ("do we not test things in local dev anymore"). Second pass: local dev server (`npm run dev`), real admin session (user logged in themselves — MFA isn't scriptable), clicked the actual Delete button on a leftover deactivated test account (`podhq-test-owner-crewe@example.com`) via claude-in-chrome — confirm panel appeared with the exact email, "Delete permanently" stayed disabled until the typed text matched, then enabled, click showed a "Deleting..." state, and the row disappeared with the user count dropping from 16 to 15 and no error. Confirms the real UI path, not just the underlying API calls.

    **Unrelated incident, same session: admin login blocked by a dead MFA factor on `carlsimpson83@yahoo.co.uk`.** Existing authenticator codes stopped validating even with the phone's clock on automatic/network time, so clock drift (the usual cause) was ruled out without a confirmed alternative explanation. Fixed by removing the verified factor (created 2026-08-01) via a one-off script and re-enrolling fresh through the normal `/login/mfa` flow — resolved, but the root cause of why a previously-working verified factor stopped validating is **not actually confirmed**, just worked around. Separately, read-only checking during this surfaced that the *other* admin account, `admin@myfitpod.co.uk`, has only an unverified MFA factor from 2026-08-04 (enrolment started, never completed) — not a bug, just means that account will get a clean QR code on its next login rather than being stuck.

15. **Pods admin backend** (`/pods`, admin + owner) — added to the roadmap 2026-08-11 at the user's request: staff need to manually book a member into a pod session and configure per-gym limits, rather than every booking going through the member-facing podhq-client app alone. Written 2026-08-11, **not yet applied/live-tested** (blocked on `0018_pod_capacity_and_hours.sql`, see Database schema below).

    Same gym-scoping convention as every other page in this app: owner locked to their own gym, admin picks any gym via `GymSelect` (defaulted to Aylesbury Berryfields, the only gym with a pod configured so far, rather than an empty state). New `src/lib/data/pods.ts` (`getPodSettings`/`updatePodSettings`/`getMembersForGym`/`getBookingsForGymAndDate`/`createManualBooking`), `src/lib/validation/pods.ts`, three routes under `/api/pods/` (`settings`, `bookings`, `members`), `/pods` page + `PodsView`, and a new sidebar nav entry in `AppShell` (visible to both roles, unlike Admin which is admin-only).

    **Scope decisions, confirmed with the user before building:**
    - A manually-created booking deducts a credit exactly like a self-service one, reusing the same `create_booking()` RPC — no special admin bypass. If the member has no credit, staff grant one first (existing `manual_grant` reason), same as today.
    - "Set limits on sessions" meant **pod capacity per slot** (a gym can now be configured to hold more than one concurrent booking, not hard-capped at 1) and **bookable hours** (which hours of the day self-service booking allows) — both configurable per gym from `/pods`, not a fixed global rule.
    - Bookable-hours is deliberately a **self-service-only** restriction — a manual booking from `/pods` can go outside the configured hours (a genuine staff override), but capacity is a **hard physical constraint that applies to every booking regardless of who makes it**, manual or self-service, since the room genuinely can't hold more people than it can hold.

    **Real bug caught during design, fixed before it shipped**: the self-service hours check in podhq-client's `/api/bookings` initially read the slot's hour via a plain server-side `.getHours()` — but Vercel's serverless functions run in UTC internally regardless of the `lhr1` region pin (confirmed: region only affects where the function executes, not its OS timezone), so during BST this would have been off by exactly one hour against the UK wall-clock hours staff configure in `/pods`. Fixed using `Intl.DateTimeFormat` with `timeZone: "Europe/London"` instead of relying on the server's own local time — see podhq-client's ROADMAP.md for the full note.

    **Migration applied and DB-level behaviour fully live-verified 2026-08-11.**
    Confirmed `gym_kisi_mapping` has the new columns with correct defaults
    (`pod_capacity: 1`, `open_hour: 0`, `close_hour: 24`) for Aylesbury
    Berryfields. Called `create_booking()` directly against production with
    throwaway test members: at the default capacity (1), a second member's
    booking attempt for an already-booked slot correctly failed with
    `slot_full`; raising `pod_capacity` to 2 let a second concurrent booking
    through and correctly rejected a third at 2/2. **Concurrency-tested the
    actual reason the advisory lock exists**: fired two simultaneous
    `create_booking()` calls at the same slot with capacity back at 1 —
    exactly one succeeded, the other correctly got `slot_full`, and the DB
    confirmed only one `booked` row exists for that slot, not two. All test
    members/bookings/credits deleted afterward, gym config reset to
    defaults.

    **`/pods` page itself not click-tested** — logging into podHq as admin
    requires MFA, which can't be scripted (same limitation noted for Stage
    14's testing). The manual-booking UI, settings form, and gym-scoping
    should be exercised through a real logged-in session before relying on
    it for real staff use; the underlying `create_booking()` RPC and
    `/api/pods/*` route logic it calls are verified as above.

    See podhq-client's ROADMAP.md for the matching self-service-side live
    verification (hours filtering, the BST timezone fix, regression check
    on normal all-day bookings).

16. **Franchisee other income** (`/outgoings` entry form + `/revenue` card) —
    added to the roadmap 2026-08-13 at the user's request: franchisees have
    real income GymFlow never sees (room/space rental, vending commission,
    corporate/wellness contracts, PT, retail, events) and had no way to
    record it. New `gym_other_income` table, app-managed, deliberately kept
    **out** of `Revenue` itself — `Revenue` stays 100% GymFlow-pipeline-only
    with zero manual writes anywhere in this app's history (see the Data
    pipeline section below), and its per-customer/category calculations
    (LTV, top customers, category pie) key on `sold_to`/category fields that
    don't map onto things like a vending machine.

    **Scope decisions, confirmed with the user before building:**
    - Two category behaviours, not one: **recurring** categories (Room/Space
      Rental, Vending Commission, Corporate/Wellness Contract, Other
      Recurring Income) carry forward month to month exactly like
      `gym_outgoings` — enter once, it applies until changed. **One-off**
      categories (Personal Training, Retail Sales, Event Income, Other
      One-off Income) only count for the exact month entered — carrying a
      variable figure forward would silently overstate a quiet month. Which
      list a category belongs to is fixed in code
      (`RECURRING_INCOME_CATEGORIES`, `src/lib/data/types.ts`), not a
      per-entry choice.
    - No free-text category (would break cross-gym comparability, same
      reasoning as `gym_outgoings`' fixed list) — but every entry does get
      an optional free-text `label` (e.g. "Xyz Corp contract") purely as a
      memo, never used for grouping or totals.
    - Feeds **both** places, not one or the other: the Outgoings/P&L net
      figure (`net = revenue + otherIncome - outgoings - adSpend`, same
      pattern `ad_spend` already established — its own page plus a P&L
      contribution) and a separate, clearly-labelled "Other income" card on
      `/revenue` (GymFlow revenue + other income = combined total).
      Deliberately **not** blended into `/revenue`'s category pie, top
      products/customers, or the vs-previous-period/YoY trend lines — those
      are all GymFlow-only concepts.
    - Same gym-scoping as outgoings: owner locked to their own gym; admin
      has fallback edit access to whichever gym they select.

    **Two build issues found and fixed, both repeats of documented project
    lessons:**
    - `create table if not exists` silently no-ops against a table that
      already exists — an early ad-hoc version of the table (created before
      the `label` column was added to the design) meant the real migration's
      `create table if not exists` never actually added `label`, and the
      column was missing until fixed with a direct `alter table ... add
      column`. Same class of bug as `0005`/`0011`'s FK-cascade drift, same
      root cause.
    - The migration file was originally numbered `0024_gym_other_income.sql`
      but collided with `0024_waitlist.sql` from a concurrent, unrelated
      session working in the same repo (a leads/waitlist feature,
      migrations `0021`–`0024`) — neither session could see the other's
      uncommitted file. Renamed to `0025_gym_other_income.sql`; no overlap
      with that feature's tables or files otherwise.

    **Verified live 2026-08-13** against Aylesbury Berryfields (admin
    session; owner-role gym-lock not re-tested here since it's the same
    code path already proven for `gym_outgoings` — see the note on Stage
    15's untested `/pods` UI for why owner sessions can't be scripted).
    Entered a recurring Vending Commission row effective 2026-06 (£150) and
    a one-off Personal Training row for the same month (£80): July's Other
    income tile correctly showed only the carried-forward £150 (Personal
    Training correctly excluded), the monthly trend chart showed £230 for
    June and £150 for July, and Net P&L math checked out exactly
    (`revenue + otherIncome - outgoings - adSpend`). `/revenue`'s combined
    card showed GymFlow revenue, other income, and their sum correctly
    aggregated across all gyms, with the category pie/top products/top
    customers unchanged from before the entries existed — confirming the
    "additive but never blended in" design held. Test rows deleted
    afterward via direct SQL (`delete from gym_other_income where gym =
    'Aylesbury Berryfields'`), confirmed back to £0 across the board.

17. **Staff refunds (`/pods/transactions`, admin + owner)** — added to the
    roadmap 2026-08-14 after the user asked directly whether podHq needed
    its own Stripe integration; the real trigger was refunds specifically —
    reading revenue is already solved by both apps sharing one Supabase
    project, but issuing a refund genuinely needs the Stripe API, which
    podHq had never touched before. Scope confirmed with the user first:
    all three purchase types (credit packs, memberships, gift vouchers),
    and ledger correction driven by Stripe's webhook rather than the
    refund-issuing request itself — the same pattern every other
    Stripe-driven balance change in podhq-client already uses, so a refund
    that succeeds at Stripe but fails to write here still lands correctly
    once the webhook fires, instead of the two systems silently drifting.

    **Real gap found before any of this could work**: nothing captured the
    Stripe payment/charge reference at purchase time — only
    `stripe_event_id` (the webhook event id) existed, which isn't enough to
    call `stripe.refunds.create()`. `0026_stripe_refunds.sql` (written and
    **applied 2026-08-14**) adds `stripe_payment_intent_id` to
    both `credits` and `gift_vouchers`, adds `'refund'` to
    `credits.reason`'s CHECK constraint, and adds `refunded_at` to
    `gift_vouchers`. First paste into Supabase's SQL editor hit the same
    class of error as the cancel-session migration (42601, a statement
    terminator lost somewhere in the copy) — fixed by clearing the editor
    and pasting fresh in one go rather than appending. Originally drafted
    as `0021_stripe_refunds.sql` but
    renumbered before writing anything to disk — `0021` was already taken
    by `0021_notification_log.sql` from the concurrent leads/waitlist work
    landed just before this session (same class of collision the
    `gym_other_income` migration hit in Stage 16, caught this time by
    listing the migrations folder first instead of after the fact).

    **podhq-client changes** (see its own ROADMAP for the full detail):
    the Stripe webhook now captures `stripe_payment_intent_id` on every
    credit-pack, membership-renewal, and gift-voucher insert — the
    membership case needed real research, not a guess: `Invoice` has no
    direct `payment_intent` field in the installed Stripe SDK version
    (confirmed against its type definitions), replaced by the Invoice
    Payments API, so that path calls `stripe.invoicePayments.list()` to
    find the default payment's reference. A new `charge.refunded` handler
    in the same webhook does the actual ledger write: a negative `credits`
    row (`reason: 'refund'`, idempotent via `stripe_event_id` same as every
    other insert there) for credit-pack/membership refunds, or setting
    `gift_vouchers.refunded_at` for vouchers — matched via
    `stripe_payment_intent_id`, gated on a fully-refunded charge (partial
    refunds are logged, not processed — out of scope for v1, staff only
    ever issues a full refund). Voucher redemption (`/api/vouchers/redeem`)
    now also rejects an already-refunded code, using the same atomic
    `.is(..., null)` claim pattern as the existing redeemed-check.

    **podHq side**: `src/lib/stripe.ts` — a deliberately separate
    `STRIPE_SECRET_KEY` from podhq-client's, not the same value reused
    across both apps; should hold a **restricted key** (Charges: read,
    Refunds: write) rather than the full-access key that can also create
    checkout sessions and subscriptions, same least-privilege reasoning
    CLAUDE.md already applies to `KISI_API_KEY`. Not yet added to either
    app's env — a manual step before this can be live-tested.
    `src/lib/data/refunds.ts` lists recent gym-scoped transactions (only
    rows with a captured `stripe_payment_intent_id` show up at all — older,
    pre-migration purchases are excluded rather than shown as permanently
    un-refundable) and looks up a specific transaction's payment_intent +
    owning gym before any Stripe call is made. `POST /api/pods/refund`
    only ever calls `stripe.refunds.create({ payment_intent })` (a full
    refund by omitting `amount`) — it never touches the ledger directly,
    same IDOR-proofing pattern as `/api/unlock`: an owner's request is
    checked against the transaction's real gym (looked up server-side,
    never client-supplied), a mismatch returns 404 rather than 403 so it
    doesn't confirm another gym's transaction even exists. New
    `/pods/transactions` page + `TransactionsView` (inline confirm panel
    per row, no native `window.confirm`, matching this app's existing
    pattern), linked from `/pods`.

    **`0026_stripe_refunds.sql` applied 2026-08-14.** Still not
    live-tested — blocked on two remaining manual steps: adding a
    restricted `STRIPE_SECRET_KEY` to podHq's env (locally and in Vercel),
    and adding `charge.refunded` to the production Stripe webhook
    endpoint's configured event list (same per-event-type opt-in Stage 8
    already established — this endpoint doesn't forward every event type
    by default). `npx tsc --noEmit` and
    `eslint` pass in both repos. The PostgREST embedded-join syntax used in
    `getRecentTransactions` for `gift_vouchers` (`members!purchaser_member_id!inner(...)`,
    disambiguating from that table's other member FK,
    `redeemed_by_member_id`) has no prior example anywhere else in either
    codebase — reads correctly against Supabase's documented syntax but
    is unverified against the real API until the migration is applied and
    this is tested live.

## Database schema

Two tables pre-date this project and were never created by our migrations — they
came already populated from GymFlow. Everything else was created in
`supabase/migrations/0001_core_schema.sql`.

**Shared with `podhq-client`:** that app is a separate repo/deploy but uses
this same Supabase project, and its migrations (`0009_pod_booking.sql`
onward — `members`, `credits`, `bookings`, `gym_kisi_mapping`,
`pod_access_events`) live in this folder rather than a duplicated one — see
its own ROADMAP.md for what those tables are for. **`0014_pod_memberships.sql`
applied 2026-08-11**: widens `credits.reason` to also allow `'membership'`
(alongside the existing manual_grant/booking_used/booking_refund/purchase),
and adds a new `memberships` table (member_id unique, tier_id/tier_name/
credits_per_period, stripe_subscription_id unique, status, current_period_end)
tracking each pod member's recurring monthly-credit subscription — see
podhq-client's ROADMAP.md Stage 8 for the feature this supports. Flagged here
per that project's shared-schema rule: a change to this shared DB needs
noting on both sides, not just wherever it was made.

**`0017_pod_member_access.sql` applied 2026-08-11**: adds 8 nullable
columns to `members` (`mobile_number`, `gender`, `address_line1/2`,
`address_city`, `address_postcode`, `waiver_signed_name`,
`waiver_signed_at`) for podhq-client's "Access" onboarding flow (mobile +
gender, address, signed waiver) that gates the physical door Unlock — see
podhq-client's ROADMAP.md "Access onboarding" section. No CHECK constraint
on `gender`, validated app-side instead.

**`0018_pod_capacity_and_hours.sql` applied 2026-08-11**: adds
`pod_capacity` (default 1), `open_hour` (default 0), `close_hour`
(default 24) to `gym_kisi_mapping`, for this app's `/pods` admin page (see
Stage 15) — lets staff configure how many concurrent bookings a gym's pod
can hold and which hours are open to self-service booking. Drops the old
partial unique index on `bookings (gym, slot_start)` (it hard-capped every
gym at exactly 1 concurrent booking, too strict once capacity can be >1)
and replaces `create_booking()` with a version that enforces capacity
itself, serialized via `pg_advisory_xact_lock` so two concurrent booking
attempts for the same gym+slot can't both slip past a plain row-count
check. Every existing gym keeps `pod_capacity = 1` (unchanged default), so
no gym's real behaviour changed until explicitly reconfigured via `/pods`.

**`0019_get_credit_balance_function.sql` applied 2026-08-11**: adds
`get_credit_balance(p_member_id)`, a Postgres-side sum over `credits`
replacing podhq-client's old pattern of fetching every ledger row and
summing in JS — found during a load/scaling review prompted by the user's
"replace GymFlow entirely" ambition (see podhq-client's ROADMAP.md for the
full note): `credits` is append-only (one row per booking/purchase/
renewal), so a long-tenured member's row count isn't bounded, and
PostgREST silently truncates any single request past 1000 rows with no
error — against a ledger sum specifically, that means a genuinely wrong
balance, not just an incomplete list, once a member's history gets long
enough. Same pattern `create_booking()` already used internally for its
own balance check.

**`0026_stripe_refunds.sql` written and applied 2026-08-14**: adds
`stripe_payment_intent_id` to `credits` and `gift_vouchers` (nothing
previously captured the actual Stripe payment reference — only
`stripe_event_id`, the webhook event id, which isn't enough to issue a
refund), widens `credits.reason` to also allow `'refund'`, and adds
`refunded_at` to `gift_vouchers`. Supports this app's new Stage 17 staff
refund feature (`/pods/transactions`) — see that stage above for the full
detail, and podhq-client's ROADMAP.md for the webhook-side changes that
populate/consume these new columns.

**`0020_cancel_booking_function.sql` written and applied 2026-08-12**
(per the shared-schema rule — flagged here so a podHq session isn't
surprised by the new function): adds `cancel_booking(p_member_id,
p_booking_id)` for podhq-client's new member-facing cancel feature (see
its own ROADMAP.md for the full build). Enforces a 2-hour cancellation
policy — refunds the credit (`credits.reason = 'booking_refund'`, allowed
since 0009 but unused until now) if cancelled more than 2 hours before
`slot_start`, forfeits it otherwise — atomically via `for update` on the
booking row, same race-safety concern `create_booking()` already handles
with its advisory lock. No table/column changes, function-only.

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

## Auth pattern in server-side code

**Never query `users_gyms` (or any table) via the session-scoped client
relying on RLS as the actual authorization check — use the service-role
client after verifying the session separately.** RLS on `users_gyms` is
documented defense-in-depth (see the migration file), not the primary
authorization path; every data-layer query already followed this except
`getGymScope`, which used the session client and depended on RLS's
`user_id = auth.uid()` policy passing. Found 2026-07-26: a real admin
account intermittently got "No gym or role is assigned to this account" —
not an error, `auth.uid()` was transiently failing to resolve (a
token-refresh timing gap), which RLS turns into a silent empty result,
indistinguishable from "this account genuinely has no gym" unless you
already suspect it. Fixed by having `getGymScope` take just `userId` (already
verified by the caller via `supabase.auth.getUser()`) and query via
`createAdminClient()` instead — no RLS dependency, no timing gap possible.
If a future data-layer function is tempted to take a session-scoped
`SupabaseClient` and query through it, don't — verify the session once
(`getUser()`), then query via the admin client, matching every other
function in `src/lib/data/`.

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

**Resolved 2026-07-28:** user re-ran the GymFlow/UiPath automation for
Aylesbury Berryfields and it backfilled cleanly — Jan–May 2026 now show
244/185/207/171/232 rows respectively, in line with the surrounding months
(Dec 2025: 192, Jun 2026: 203). Checked for duplicates from the re-run
(matching on date + item + `sold_to` + amount across all 1,039 Jan–May rows,
since `Revenue` has no unique constraint to prevent double-insertion on a
rerun) — zero repeats found. No further action needed; kept the note below
for the record since it documents both the gap and how it was ruled out as
app-caused.

**Known gap (resolved, see above): Aylesbury Berryfields was missing
`Revenue` entirely for Jan–May 2026** (confirmed 2026-07-28 by querying row
counts per
`report_month`) — zero rows for all five months, despite continuous monthly
data from 2023-02 through 2025-12 and data resuming normally in 2026-06
(203 rows, in line with prior months). Every other established gym has
`Revenue` rows throughout Jan–May 2026, including Hackney and Crewe, so this
isn't the same issue as the attendance gap above — it's isolated to one
gym, one metric, one contiguous window, with real data both before and
after. (Fairford Leys having no data before 2026-06 is unrelated and
expected — it's a newly onboarded gym, not a gap.) Cause unknown — an
upstream GymFlow/UiPath pipeline question, not fixable by changing queries.
Any revenue total, trend chart, or YoY comparison covering Jan–May 2026 will
understate Aylesbury Berryfields until this is backfilled or the cause is
found; no query-layer workaround (e.g. estimating/interpolating the gap) has
been applied — the pages surface whatever's actually in the table.

**Ruled out as app-caused (verified 2026-07-28):** user suspected a recent
code change deleted the rows. Checked directly against the DB rather than
just re-reading the code (per the auth-debugging lesson above — don't
accept "it should be fine" without live verification): `pg_policy` on
`"Revenue"` shows exactly one policy, `select own gyms` (`polcmd = 'r'`,
SELECT-only) — no write/update/delete policy has ever existed on this
table, in any migration. A full-repo check (all 4 migration files, every
API route, every `src/lib/data/*.ts` reference to `Revenue`) found zero
INSERT/UPDATE/DELETE/TRUNCATE statements against it anywhere — it's
read-only from the app's side, consistent with it being GymFlow/UiPath-
populated and never manually written to (see Data pipeline intro above).
An `ilike '%aylesbury%'` sweep across Jan–May 2026 (to rule out the rows
being hidden under a whitespace/case-variant gym string rather than truly
absent) also returned zero rows. Conclusion: the data was never ingested
for this window — no app code path could have deleted it, since none ever
had write access.

**Future system change:** moving from Kisi to **PDK (ProdataKey)** for door
access, which will give proper day-to-day check-in/check-out timeseries
data — richer than the current monthly GymFlow attendance CSV. Worth
remembering when Stage 6 (Member Insights) gets built: don't over-invest in
working around the current CSV's limitations if PDK is coming.

## Feature specs (Stages 5-9)

**Revenue analytics (`/revenue`) — done in full 2026-07-26.** Filters: gym
(admin only), date-range presets (Last Month/QTD/Last Quarter/YTD/Full Year
+ year selector). KPIs: total revenue with vs-previous-period and
vs-same-period-last-year, transaction count, average revenue/transaction,
category pie (Memberships vs PAYG/Packs), category-split stacked area over
time, monthly trend line w/ YoY overlay, top 10 products bar chart, top 10
customers table (rank, name, total, % of revenue). Still to do: make the
dashboard's revenue-by-gym bar chart bars link through to this page,
filtered to that gym (deferred — no urgency now that both pages exist
independently).

**Member insights (`/members`)** — filters: gym, month. KPIs: active members
(`attendance`>0), at-risk table (1-3 visits, colour-coded: 1=red, 2-3=amber),
top attenders, avg attendance/active member. LTV section: LTV per `sold_to`
(total spend, avg monthly spend × avg lifespan months), LTV distribution
histogram, top 20 LTV customers/gym, "affordable CAC" = LTV ÷ 3.

**Outgoings / P&L (Stage 7) — done in full 2026-07-27.** `gym_outgoings`
table (app-managed, not GymFlow-sourced), owner-submitted per gym, admin can
view all + has fallback edit access to any gym they select (same oversight
pattern as everything else — entry is owner-only, visibility isn't). Shape:
`gym`, `category` (validated at the app layer, not a DB constraint — see the
build note above), `amount_gbp`, `effective_from` (month), `created_by`,
`created_at` — a category's value carries forward automatically to later
months until changed, so nobody re-enters unchanged figures like rent every
month; looks up "most recent row at or before the target month" per
category rather than requiring a row for every period. Delete also
supported (added same-day, see build note above), gym-locked the same way
insert is. `/outgoings` shows KPI tiles (Revenue, Outgoings, Ad spend, Net
P&L), a per-category breakdown + entry form + history for whichever single
gym is in view, and — admin, "All gyms" only — a per-gym P&L table plus a
consolidated total row.

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
on filter change), WCAG 2.1 AA + colour-blind-safe chart palette + data-table
alternative for every chart, Chrome/Safari-iOS/Edge with mobile Safari as
primary target, GBP formatting throughout (2dp, thousands separator). (PWA
offline shell was descoped from this app to `podhq-client` — see Stage 11.)
