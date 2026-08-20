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

    **Fully live-verified end-to-end 2026-08-14**, closing out the two
    remaining manual steps above and surfacing several real, unrelated
    bugs along the way — none of them in the refund feature's own code:

    - **Both remaining Stripe keys were added**, but initially swapped
      between the two apps' `.env.local` files — podhq-client ended up
      with podHq's restricted (Charges: read, Refunds: write) key, which
      can't create Checkout Sessions, breaking `/buy-credits` with a real
      `403 more_permissions_required` from Stripe. Fixed by moving the
      restricted key to podHq's env and restoring podhq-client's own
      full-access key.
    - **podhq-client's Stage 17 commit (`0e5fd30`, the `stripe_payment_intent_id`
      capture + `charge.refunded` handler) was local-only** — same class
      of gap as podHq's own refund-feature commit being unpushed — so the
      first real test purchase hit the *old* production webhook and got
      `stripe_payment_intent_id: null`. Fixed by pushing and deploying
      podhq-client to production; a second test purchase captured the
      payment intent correctly.
    - **Unrelated: the admin account (`carlsimpson83@yahoo.co.uk`) couldn't
      log in** — password rejected, then a "too many attempts" soft lock.
      Root cause traced via `auth_events`: the account's `updated_at` had
      changed outside any audited podHq code path (no matching
      `admin_password_reset` event), meaning something edited it directly
      in Supabase rather than through the app. Resolved using podHq's own
      in-app admin "Reset password" action instead of chasing the direct
      edit further.
    - **Local-dev-only quirk, not a real bug**: with both apps running on
      `localhost` (different ports), browser cookies aren't port-scoped,
      so a podHq admin session was also being read as a valid session by
      podhq-client's middleware, redirecting `/signup` back to `/book`
      and making the sign-up button look broken. Only reproduces when
      running both apps locally at once; doesn't happen in production
      (separate domains).

    **Verified live**: a real test member (`podhq-test-refund@example.com`)
    bought 1 credit via actual Stripe Checkout (test mode) through
    podhq-client; the `credits` row correctly captured
    `stripe_payment_intent_id`. From podHq's `/pods/transactions`
    (Aylesbury Berryfields, admin session), the transaction appeared
    correctly (confirming `getRecentTransactions`' previously-unverified
    embedded-join query works against the real API), the inline
    confirm-panel flow worked, and clicking Confirm produced a genuine
    ledger correction: a second `credits` row, `amount: -1`,
    `reason: 'refund'`, same `stripe_payment_intent_id` as the original
    purchase, arriving via a distinct `charge.refunded` Stripe event —
    confirming the full chain (refund UI → Stripe refund API →
    `charge.refunded` webhook → ledger write) end-to-end, not just a 200
    response.

18. **`/pods` renamed to "Access", with a live door-entry log** — added
    2026-08-14 at the user's request, modelled on GymFlow's own
    club-wide Access Logs page (User/Membership/Check-in/Check-out
    table) but scoped to what podHq actually has data for: Kisi
    door-unlock *attempts* (`pod_access_events` — member, timestamp,
    success/fail, blocked-reason), not check-in/out duration,
    membership type, or guest status, none of which this table tracks.
    Confirmed with the user before building: rename the existing `/pods`
    tab (keep its booking/settings/refunds pages) rather than add a
    separate tab, and build only with the real columns available rather
    than fabricating the missing ones.

    Sidebar nav label and page H1 changed to "Access" (icon unchanged —
    the existing padlock already fit). New top section on `/pods`:
    `getAccessEventsForGym` (`src/lib/data/pods.ts`) joins
    `pod_access_events` to `members` (`members!inner`, filtered on
    `members.gym` since the events table itself has no gym column) for
    the date range, exposed via `GET /api/pods/access-events` (same
    session/scope/rate-limit pattern as the existing `/api/pods/bookings`
    route). "Live" is 15s client-side polling rather than a websocket/
    Supabase Realtime channel — this codebase has no realtime plumbing
    yet, and polling only runs while viewing today's date, not historical
    ones. A status filter (All/Successful/Blocked) narrows the same
    fetched list client-side.

    Verified live against real historical data (12 Aug, Aylesbury
    Berryfields): the log correctly showed one blocked attempt
    (Pilot Test Member, location-gate rejection) with the reason in a
    hover tooltip, the "● Live" indicator correctly appeared only when
    the date filter was on today, and the status filter correctly
    narrowed to zero rows when set to "Successful only" against that
    all-blocked day. `npx tsc --noEmit` passes clean.

    **Same-day follow-up: Access stripped down further, its other content
    split out into two new places.** Scoped against three more GymFlow
    screenshots the user provided (member profile page, bookings list,
    payments/refund menu) plus a description of GymFlow's own Calendar.
    Confirmed with the user before building: Access keeps *only* the entry
    log now; Pod settings, manual booking, and the bookings-for-date list
    move to a new Calendar page (below); Transactions/refunds move off
    Access entirely and onto each member's own new profile page, reached
    by clicking their name in the Access log.

19. **Member profile pages + a new Calendar page** — same session as the
    Access rename above, 2026-08-14. Two more real pieces split out of the
    old all-in-one `/pods` page:

    **Member profile (`/pods/members/[id]`)**: Profile info (mobile,
    gender, address, waiver, member-since, live credit balance via
    `get_credit_balance`), Bookings history, and Payments — the
    Refund action moved here verbatim from the old flat
    `/pods/transactions` list, which is now deleted along with its
    component and API route (`getRecentTransactions` also removed,
    replaced by a per-member `getTransactionsForMember` in
    `src/lib/data/refunds.ts`; the refund API route itself,
    `/api/pods/refund`, was already member-agnostic and needed no
    change). Same IDOR-proofing pattern as the refund lookup: the
    member's gym is derived server-side and an owner viewing another
    gym's member gets "Member not found," never a 403 that confirms the
    member exists. `AccessEvent` gained a `memberId` field so the Access
    log's member names could link through. Verified live against two
    real members: one with no Stripe purchases (correct "not provided"/
    empty-state fallbacks throughout) and one from this session's Stage
    17 refund testing (correctly showed the purchase, the refund, and a
    credit balance that matches the real ledger math across a
    pre-migration purchase, a captured purchase, and its refund).

    **Calendar (`/pods/calendar`, new nav item)**: date navigation
    (back/Today/forward), a Day/Week/Month view switcher, and — scoped
    down from GymFlow's own richer occurrence panel to what podHq
    actually has data and capability for — a click-a-slot panel showing
    real booked members and real waitlist entries (`waitlist_entries`,
    already populated by podhq-client's waitlist feature but never
    surfaced anywhere in podHq before now) side by side, a search-to-add
    box reusing the existing manual-booking flow, and a Cancel action per
    booked row. Deliberately did *not* build GymFlow's "Email All" /
    "Check In All" (no email capability or manual check-in concept exists
    in this app) or its Class Count / User Type columns (no matching
    data) — same "don't fabricate missing data" discipline as the Access
    log rebuild. "Edit Class" became "Edit settings," reusing the exact
    capacity/open-hour/close-hour form from the old `/pods` page, since
    podHq's pod config is per-gym, not per-occurrence like GymFlow's
    classes.

    New data-layer functions in `src/lib/data/pods.ts`:
    `getBookingsForGymAndRange` (one range query per view load, bucketed
    into per-slot counts client-side rather than one query per grid
    cell), `getSlotDetail` (booked + waitlist for one exact slot), and
    `cancelBookingAsStaff` — which reuses podhq-client's existing
    `cancel_booking()` RPC and its 2-hour refund/forfeit policy rather
    than inventing a separate staff-cancellation rule, looking up the
    booking's real `member_id` server-side (never client-supplied) both
    for the RPC call and as the ownership check. Three new routes
    (`/api/pods/calendar`, `/api/pods/slot`, `/api/pods/bookings/cancel`)
    follow the same session/scope/rate-limit pattern as every other pods
    route; settings, members, and manual-booking all reuse the
    already-existing `/api/pods/settings`, `/api/pods/members`, and
    `/api/pods/bookings` routes as-is.

    **Real bug caught and fixed during this build, not by the user**:
    `AppShell`'s active-nav-item check was a plain `pathname.startsWith(item.href)`,
    which broke the moment two hrefs shared a prefix — `/pods/calendar`
    starts with `/pods` too, so both "Calendar" and "Access" would have
    highlighted simultaneously the instant Calendar was added. Fixed by
    picking only the single longest matching href across both the
    desktop sidebar and the mobile bottom nav (which had the identical
    bug duplicated).

    Verified live: real bookings rendered in exactly the right grid
    cells across a full week (cross-checked against known data from
    earlier in this session); clicking a booked cell showed the correct
    real member with a working Cancel button and an empty, correctly-
    labelled waitlist; Month view showed correct real per-day booked
    counts and clicking a day correctly switched to Day view for that
    date; nav highlighting confirmed fixed (Calendar and Access no
    longer both light up). `npx tsc --noEmit` and `eslint` both pass
    clean across every file touched this session.

20. **Switched from dark-only to a light theme** — same session, 2026-08-14,
    at the user's request after installing the `ui-ux-pro-max` Claude Code
    skill (`nextlevelbuilder/ui-ux-pro-max-skill`, a large/well-established
    community skill — verified before installing rather than trusted
    blind) and comparing against Resend's actual dashboard (the user's own
    live session, screenshotted for reference). Decided against the
    skill's generic suggested palette (a dark-tech dashboard theme with a
    green accent) since it would have discarded the app's existing,
    already-documented brand gold (`#c9a24b`) for no real reason — the
    actual problem, on inspection, wasn't the palette but that 3 of the
    app's ~65 card-style call sites (all from Stage 19, built earlier the
    same session: Access, Calendar, member profiles) used a plain flat
    card style instead of the established `.card-glass` treatment; fixed
    those 3 files directly rather than touching the other ~62 that were
    already consistent.

    The light-theme switch itself came from a second, explicit ask,
    reversing `globals.css`'s original "dark-only by design" decision:
    `--background`/`--card` went from black to white/off-white,
    `--foreground`/`--muted-foreground` inverted to dark-on-light, native
    form control theming (`color-scheme`) switched from `dark` to `light`,
    and `.card-glass` was redefined from a translucent gradient-hairline-
    border treatment (relied on light-on-dark contrast) to a flat
    Resend-style white panel with a thin border and soft shadow — same
    class name, same ~65 call sites, only the definition changed.
    `--accent` (the brand gold) was kept rather than replaced, used
    sparingly (buttons, active nav pill) rather than as a large dark
    panel, matching Resend's own restrained use of color. Sidebar
    active/hover states in `AppShell` were rebuilt for the light
    background (a heavy gold gradient + glow does not read the same on
    white as it did on black) — a soft `bg-accent/10` tint instead — and
    the sole remaining hardcoded dark-mode utility (`hover:bg-white/5`)
    was flipped to `hover:bg-black/5`.

    **Two real, computed accessibility issues caught before shipping,
    not just eyeballed**: (1) an accidental transcription of
    `--accent-foreground` to white during the token rewrite — white text
    on the gold button background computes to 2.40:1, failing WCAG's
    4.5:1 text threshold outright; reverted to the original near-black
    value (8.25:1). (2) the `--series-membership` chart-fill color
    reusing the brand gold as-is: 2.40:1 on the new white `--card`,
    failing even the more lenient 3:1 non-text/graphical threshold that
    actually applies to chart marks — fixed with a darker gold
    (`#b18a35`, 3.20:1) used only for that chart slot, leaving the UI
    `--accent` itself untouched since its actual use (button/pill fills
    with near-black text) was never the problem. Both computed via a
    small Node WCAG-relative-luminance script, not estimated.

    **Known gap, not fixed this session**: `logo-mark.png` has an opaque
    black background baked into the image itself (not transparent/white
    strokes as assumed) — it now renders as a solid black square against
    the light sidebar. Needs a new light-background export of the asset;
    out of reach without image-editing tooling or the source file.

    Verified live across Calendar, a member profile, Dashboard, Revenue,
    and Members: cards, charts (donut, stacked area, bar), stat tiles,
    filter pills, and the at-risk/top-attenders tables all render
    correctly against the new white background with no leftover
    dark-mode-only styling found beyond the logo issue above.
    `npx tsc --noEmit` and `eslint` both pass clean (same 3 pre-existing,
    unrelated warnings as before: `turnstile-widget.tsx`'s
    `set-state-in-effect`, `logo.tsx`'s `<img>` warning, an unused var in
    `admin.ts`).

    **Same-day follow-up: sidebar reverted to solid black, card borders
    thickened.** Full-light was one step too far for the user's taste —
    the nav chrome (desktop sidebar, mobile top bar, mobile bottom nav)
    went back to black, kept genuinely separate from the light content
    area via new dedicated tokens (`--sidebar-background/-foreground/
    -muted-foreground/-border`) rather than reusing the light
    `--foreground`/`--card-border` with per-component dark: overrides —
    cleaner given the sidebar is a fixed dark island, not something that
    needs to follow the page theme. `SignOutButton` (only ever rendered
    inside that chrome) switched to the same tokens directly. The
    active-nav-item treatment reverted to the original solid gold
    gradient + glow (`bg-gradient-to-r from-accent to-accent-hover
    text-accent-foreground shadow-[...]`) rather than the softer
    Resend-style tint tried earlier that day — it reads fine again now
    that it's back on black, which is what it was originally tuned for.
    `--card-border` darkened from light gray to near-black
    (`#18181b`) and `.card-glass`'s border width doubled to 2px for a
    more visibly "boxed" card look. Pleasant side effect, not intended:
    the earlier-flagged logo issue (opaque black background baked into
    `logo-mark.png`) is now moot — the logo sits on a matching black
    sidebar again, so the asset never needs replacing after all.
    Verified live on Dashboard (stat tiles, warning card, bar chart) and
    Calendar. **The Calendar check at the time was too shallow — a
    full-page screenshot, not a zoomed-in one — and missed a real bug the
    user caught immediately after: the Week/Day/Month grids' gridlines
    didn't actually cross at intersections.** Root cause: those grids
    used a CSS-grid `gap-px` + `bg-card-border` trick to fake gridlines
    (a background color showing through 1px gaps between cells), which
    doesn't guarantee gaps stay pixel-aligned across rows/columns when
    track widths are fractional (`minmax(90px, 1fr)`) — invisible on the
    original thin light-gray border, obvious once it went darker/thicker
    for this same follow-up. Fixed by rebuilding both grids as real
    `<table>` elements with `border-collapse: collapse` (`table-fixed` +
    an explicit `<colgroup>` for the hour-label column's width) instead
    of divs — browsers guarantee collapsed table borders merge into
    single lines that cross cleanly, which the gap trick never actually
    promised. Re-verified with an actual zoomed screenshot this time,
    not just a full-page one: clean crossing intersections confirmed on
    both Week and Month views, real booked counts/colors unchanged.
    `npx tsc --noEmit` and `eslint` clean.

21. **Staff sell/comp packs & memberships (`/pods/members/[id]`), card-on-file, and a live per-gym pricing catalog (`/setup`)** — one long session, 2026-08-15, that grew substantially from its original scope after live comparison against GymFlow's own equivalent screens.

    **Grant credit** (small standalone piece, built first): a "Grant credit" button on the member profile header, inserting a `manual_grant` credits row (the `reason` and table already existed from Stage 15/0009, just no UI to write one from podHq). Verified live: 61→66 credits, confirmed against the real `credits` row, test row deleted after.

    **Sell a pack or membership**: staff pick a credit pack or membership tier, then Free / Discount / Full price. Free is a direct ledger write (packs: reuses the grant-credit path sized to the pack; memberships: an `0027`-enabled comp row with `stripe_subscription_id: null`, optionally with an end date). Discount/full price mount Stripe's **embedded Checkout** (`ui_mode: 'embedded_page'`) inline in the panel — chosen deliberately over a payment link after the user pushed back on links going unclicked, and over manual card entry after checking Stripe's own docs confirmed that path (MOTO) needs a separate account-level PCI approval from Stripe first, which embedded Checkout doesn't. A discount on a *membership* can apply to every future payment (set directly as the recurring `price_data` amount) or to the first payment only (real price stays full, a one-time `duration: 'once'` Stripe Coupon knocks the first invoice down) — both explicitly asked for rather than assumed.

    **Real bug found and fixed: podHq's CSP silently blocked Stripe's iframe.** The embedded Checkout form rendered as a generic broken-file icon with zero console error — `src/proxy.ts`'s CSP (from the Stage 2 auth-hydration hardening) only allowlisted `challenges.cloudflare.com` for `frame-src`/`connect-src`/`script-src`, with no exception for Stripe. Fixed by adding Stripe's own documented CSP directives (`docs.stripe.com/security/guide`, Checkout + Stripe.js sections combined) for all three directives, plus `img-src https://*.stripe.com`. Verified live end-to-end with a real Stripe test-mode card: session created, form rendered, payment succeeded, real `checkout.session.completed` webhook credited the ledger correctly.

    **Card-on-file** (added after comparing against GymFlow's member Payments tab, which shows a stored "Default Payment Method" reused for repeat sales): `0028_member_stripe_customer.sql` adds `members.stripe_customer_id`. Every staff-initiated Checkout now requests `customer_creation: 'always'` (or reuses the existing customer) plus `payment_intent_data.setup_future_usage: 'off_session'`, so a real purchase also saves the card; podhq-client's webhook captures the resulting customer id back onto the member. A new **"Charge card on file"** option skips Checkout entirely — packs use a direct off-session `PaymentIntent` (confirmed server-side, credited via a new `payment_intent.succeeded` webhook handler gated on `metadata.source === 'staff_saved_card'` so it can never double-fire alongside `checkout.session.completed`), memberships create a `Subscription` directly with `default_payment_method` set and `payment_behavior: 'error_if_incomplete'`.

    **Real bug found and fixed: a saved card wasn't actually selectable as "the" card on file.** `setup_future_usage` attaches a payment method to the Customer, but doesn't set it as that Customer's `invoice_settings.default_payment_method` — which is what `getSavedPaymentMethod`/`chargeSavedCardForPack` read. Found live: first purchase correctly captured `stripe_customer_id`, but the profile still showed "No card on file". Fixed by having the webhook explicitly `stripe.customers.update(..., { invoice_settings: { default_payment_method } })` after every capture (both the payment-mode and subscription-mode paths). Verified live on retest: "Card on file: VISA •••• 4242" displayed correctly, and a follow-up "Charge card on file" purchase completed with zero card re-entry, correct webhook credit.

    **Nav/breadcrumb fix**: the member profile page (`/pods/members/[id]`) was highlighting "Access" in the sidebar and showing a "← Access" breadcrumb, since it has no nav item of its own and `/pods/members/*` matched Access's `/pods` href as the longest prefix. Fixed: `AppShell`'s active-href logic now explicitly excludes `/pods/members/*` (highlights nothing, since the page is reachable from both Access and Calendar), and the breadcrumb became a generic `router.back()` "← Back" instead of a hardcoded link.

    **Full pivot to a live, per-gym pricing catalog (Setup)**, after the user compared against GymFlow's own Setup → Memberships/Credits pages and asked for the same "create new things" capability rather than fixed arrays. Went through three real design corrections before landing: first built as admin-managed and global (one catalog for every gym) under `/admin/catalog`; the user then clarified "admin" specifically means the franchisor and pricing isn't a franchisor-level decision, so it moved to a standalone "Setup" nav item, initially **owner-only** with admin locked out entirely; the user then clarified further that "admin" (the franchisor) still needs full tenant-level oversight across every gym, so it landed on **owner enters/edits their own gym, admin has fallback view/edit access to any gym they select** — the same pattern already established for Outgoings/Other Income/Marketing, not a new one.

    - `0029_catalog_items.sql` created the table; `0030` seeded it globally; **`0031_catalog_items_per_gym.sql`** (same day) added a `gym` column and re-scoped the unique constraint to `(gym, item_id)`, deleting and re-seeding via **`0032`** — safe only because no purchase history has ever referenced `catalog_items` by foreign key (`tier_id` on `credits`/`memberships` is a plain text snapshot). `0031`'s own comment is explicit that it is **not** safe to re-run once real per-gym edits exist (unlike every other migration in this project), given its unconditional `delete from`.
    - Both podHq (`src/lib/data/catalog.ts`, full CRUD: create/edit/disable, auto-deduped slugs) and podhq-client (`src/lib/data/catalog.ts`, read-only, mapped into the pre-existing `CreditPackage`/`MembershipTier` shapes so no consumer's interface had to change) now read the same shared table instead of the `CREDIT_PACKAGES`/`MEMBERSHIP_TIERS` arrays that were previously duplicated across both repos — those arrays (and podHq's now-fully-unused copies of the files) were deleted; podhq-client's copies were trimmed down to just the type interfaces, still used by other consumers.
    - `AppShell`'s `/setup` entry shows for both roles now (the brief owner-only-hidden-from-admin state was reverted same-session); `/admin` stays the only admin-only href.
    - **Verified live** (as admin, the only role available for scripted testing — MFA blocks scripting an owner login, same known limitation as Stages 15/19): catalog CRUD confirmed end-to-end via the real `/setup` UI — selected a gym via `GymSelect` (same component Marketing/Outgoings/Members use), edited "Smart Saver" £10.80 → £9.99 → back to £10.80, confirmed against the actual rendered table each time, not just the API response. **Not yet verified: the owner-side UI itself** (locked to one gym, no selector shown) — needs a real owner login before relying on it.

    **Also encountered twice, not a code bug**: Supabase's PostgREST schema cache briefly serving `42703`/`PGRST205` "column/table does not exist" errors for a few seconds immediately after each schema-changing migration, before self-resolving — consistent with previously-documented multi-pod cache propagation lag (Stage 7). Not the "smart quotes mangled the SQL" failure mode from that stage; this time the DDL itself was fine both times, confirmed by direct queries succeeding moments later.

    `npx tsc --noEmit`, `eslint`, and `next build` all pass clean in both repos as of this session's end.

22. **OWASP Top 10 audit + fixes, Stripe live-key prep, one-time catalog items** — 2026-08-16, one long session ahead of switching Stripe to live keys, spanning both repos (see podhq-client's ROADMAP for its half).

    **Full OWASP Top 10 audit** run across both repos (two parallel research passes, one per app). podHq findings and fixes:
    - **Critical — cross-gym IDOR in staff manual booking.** `createManualBooking` (`src/lib/data/pods.ts`) passed a client-supplied `memberId` straight into `create_booking()` with no check the member belongs to the gym being booked for — every sibling function (`grantCreditToMember`, `cancelBookingAsStaff`) already did this check; this one didn't. Fixed: same ownership check, returns `not_found`/404 on mismatch.
    - **High — no Stripe idempotency keys**, letting a network retry create duplicate PaymentIntents/subscriptions. Added `idempotencyKey: crypto.randomUUID()` to all four money-moving Stripe calls in `sales.ts`.
    - **High — TOCTOU race on membership creation.** `compMembership`/`createMembershipWithSavedCard` each did a plain check-then-write; two concurrent requests could both pass. New `claim_membership_slot` RPC (`0033_claim_membership_slot.sql`) does the check-and-write atomically via `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE status <> 'active'`. `createMembershipCheckoutSession` deliberately left as a plain check — real duplicate-charge risk there needs the *member* to complete two separate Checkout payments, a materially lower-probability risk than the two paths that charge immediately with no confirmation step.
    - **Medium — `/api/pods/sales/checkout-status` had no gym-scope check.** Added: owner's session is checked against the transaction's real gym (looked up server-side via new `getMemberGym`), 404 on mismatch, same IDOR-proofing pattern as the refund route.
    - **Medium — no actor attribution on money-adjacent staff actions.** Comp/grant/checkout/saved-card-charge/refund all now log to `auth_events` (new event types: `staff_credit_grant`, `staff_membership_comp`, `staff_checkout_session_created`, `staff_saved_card_charge`, `staff_refund_issued`) with the acting staff account and a JSON detail blob — previously only the *target* was knowable, never *who* acted.
    - **Medium — rate limiter had a read-then-write race.** Replaced with `increment_rate_limit` RPC (`0034_increment_rate_limit.sql`, shared with podhq-client) — one atomic `INSERT ... ON CONFLICT ... DO UPDATE` instead of a separate select+update.
    - **Dependency vulnerabilities patched**: `npm audit fix --force` (`next` 16.2.11 → 16.3.1, plus transitive `postcss`/`sharp`/`nanoid`/`brace-expansion`/`js-yaml`) — 0 vulnerabilities remaining. This pulled in a stricter `eslint-plugin-react-hooks` that promoted two pre-existing synchronous-setState-in-effect warnings (`login/page.tsx`, `turnstile-widget.tsx`) to hard errors — both fixed properly (moved the reset into the actual event that causes it, or a lazy `useState` initializer) rather than suppressed.

    **Verified live**: every permission the newly-restricted Stripe key needs (Checkout Sessions Write, Customers Read, Payment Intents Write, Products Write, Subscriptions Write, Refunds Write) was exercised end-to-end against real Stripe test-mode calls via the actual `/pods/members/[id]` UI (embedded Checkout completed with a real test card, card-on-file captured and displayed, off-session pack charge, saved-card membership subscription creation, all three refunded) — not just read from Stripe's dashboard. Test purchases refunded, test subscription cancelled directly via Stripe, credit balance back to its pre-test value (the ledger rows themselves are the correct permanent record of a purchase-then-refund, left in place).

    **Stripe key hygiene finding, not a code issue**: podHq's `STRIPE_SECRET_KEY` was actually the full-access standard key, not a restricted one — the documented "Charges: read, Refunds: write" restricted-key design (`src/lib/stripe.ts`'s own comment) had silently drifted out of sync with reality once Stage 21's sell/comp features started needing Checkout Sessions/Subscriptions/Customers/Coupons/Products too. Fixed by broadening the *actual* restricted key ("Pod Refund") to match real usage — Customers (Read), Checkout Sessions (Write), Coupons (Write), Payment Intents (Write), Products (Write), Subscriptions (Write), Refunds (Write), nothing else — and wiring that into `.env.local`/Vercel instead of the full key. Also found and fixed live: `STRIPE_WEBHOOK_SECRET` had no reason to exist in podHq's env at all (podHq has no webhook endpoint of its own — removed as dead weight, not a security fix, a webhook secret can't be used to move money).

    **Yahoo email deliverability, resolved**: a Yahoo `+alias` test address bounced (422) when podhq-client's custom SMTP (already configured via Resend, unrelated to the shared-mailer issue documented in Stage 9) tried to send a confirmation email — confirmed via Resend's own delivery logs, then confirmed the *plain* Yahoo address delivered fine. Root cause: Yahoo's inconsistent support for plus-addressing, not a real deliverability problem — closes the loop on Stage 9's "root cause not fully confirmed either way" note for Yahoo, at least for accounts with custom SMTP configured.

    **One-time-per-member catalog items** (e.g. an Intro Pack), added same session at the user's request after noticing "Smart Saver" existed as both a credit pack and a membership (a leftover from mirroring GymFlow's own workflow, which requires creating a pack before it can be attached to a membership — not needed here). New `one_time_per_member` boolean on `catalog_items` (a per-item Setup toggle, not a hardcoded name match) and `catalog_item_id` on `credits` (`0035_one_time_catalog_items.sql`) — nothing previously tracked which catalog item a purchase/grant came from, so "has this member ever received this specific item" couldn't be answered at all before this. Enforced **self-service-only**: podhq-client's `/api/checkout` blocks a repeat purchase server-side (409) and the Buy Credits page shows the item as already-claimed/disabled rather than letting a member hit a surprise rejection; staff selling/comping via podHq's sell panel is deliberately exempt (staff discretion), per the user's explicit requirement. "Smart Saver" disabled as a credit pack across all 9 gyms (the membership "Smart Save" is the real product); "Intro Pack" flagged one-time across all 9 gyms.

    `npx tsc --noEmit`, `eslint`, and `next build` all pass clean in both repos. **Not yet deployed as of this entry** — see podhq-client's ROADMAP for the matching client-side half (service worker fix, email-injection fix, install-prompt banner, one-time-item UI) and the PWA install/offline/logout live-testing notes.

23. **Per-gym Brevo email-marketing config (Setup)** — 2026-08-16, built after
    the user clarified email marketing can't reuse Stage 13's one-shared-
    account design: each franchisee runs their **own** Brevo account (own
    business name, own sender email), not one franchisor account with
    per-gym lists. `src/lib/marketing/brevo.ts`'s hardcoded `BREVO_API_KEY`
    env var + `GYM_BREVO_LIST_IDS` map is replaced by a new
    `gym_brevo_config` table (`0036_gym_brevo_config.sql`, one row per gym:
    encrypted API key + list ID), managed from a new "Email marketing
    (Brevo)" section on `/setup` — same owner-enters/admin-fallback-edit
    pattern as the pricing catalog above it on the same page. A gym with no
    row yet is silently skipped by `syncLeadsToBrevo`, same as the old
    unconfigured-gym behaviour.

    **Key handling, per the user's explicit ask ("can they be hashed
    out?")**: hashing was ruled out — it's one-way, and podHQ needs the
    real plaintext back to call Brevo's API on every sync, unlike a
    password that's only ever compared. Used reversible AES-256-GCM
    instead (`src/lib/crypto/secret-encryption.ts`, keyed by a new
    server-only `SECRET_ENCRYPTION_KEY` env var — 32 bytes, base64,
    generated via `openssl rand -base64 32`, not yet added to
    `.env.local`/Vercel). The Setup UI never receives a saved key back,
    only a masked "•••• configured · list ID N" summary with a "Replace
    key" action; `GET /api/setup/brevo` only ever returns that summary,
    never `api_key_encrypted` or the decrypted value — decryption happens
    exclusively inside `getDecryptedBrevoConfig`, called only from the
    server-side sync path. `gym_brevo_config` has RLS enabled with zero
    policies, same "service-role client only" pattern as `catalog_items`/
    `gym_kisi_mapping`. Config writes log a new `setup_brevo_key_updated`
    auth event (actor + gym + list ID) — no DB `CHECK` constraint needed
    for the new event type since `auth_events.event_type`'s check was
    already dropped project-wide back at Stage/migration 0006.

    **Not yet applied or live-tested** — `0036_gym_brevo_config.sql` needs
    running against Supabase, `SECRET_ENCRYPTION_KEY` needs generating and
    adding to both `.env.local` and Vercel, and Aylesbury Berryfields (the
    user's own gym, chosen as the real test case since a Brevo account can
    actually be created for it now) needs a real Brevo account + API key
    before this can be exercised end-to-end. `npx tsc --noEmit`, `eslint`,
    and `next build` all pass clean.

    **Applied and verified live, same day.** Migration run via Supabase's
    SQL Editor, confirmed via a throwaway row-count script
    (`gym_brevo_config` present, 0 rows). `SECRET_ENCRYPTION_KEY`
    generated (`openssl rand -base64 32`) and added to podHQ's
    `.env.local` — initially added to podhq-client's by mistake (same
    class of key-swap slip as Stage 17's Stripe keys), moved to the
    correct app, dev server restarted to pick it up. User connected a
    real Brevo account for Aylesbury Berryfields (sender verified as
    `admin@myfitpod...` for now — a deliberate placeholder, not a real
    per-gym identity yet, since every gym will eventually get its own
    Brevo *and* Resend account) and entered the API key + list ID via
    `/setup`.

    End-to-end sync verified against Brevo's real API, not just a 200
    response: decrypted the stored config, POSTed a test contact with the
    same request shape `syncLeadsToBrevo` uses, confirmed via a separate
    `GET` that it actually landed in the correct list (10), then deleted
    the test contact via Brevo's `DELETE` endpoint. Tested through a
    standalone script reimplementing the decrypt + Brevo-call logic
    rather than importing the real module directly — Next's `server-only`
    guard throws outside the Next bundler by design, so the actual
    module can't be run standalone. The real `/marketing` upload path
    through the actual UI is still unverified (same MFA-login scripting
    limitation noted at Stages 14/15/19) — worth a real click-through
    before fully relying on this for real leads.

    **Also discussed, not built**: a "walk through the door and the app
    greets you by name" voice feature (AI-coach-adjacent, raised then
    parked in favour of this) — landed on triggering off the existing
    unlock action in podhq-client (not a real Kisi door-sensor webhook,
    which doesn't exist) with a real TTS voice cached per member at
    signup rather than synthesized live on every visit, to keep cost near
    zero at franchise scale. No spec, no build — parked for a future
    session; see `[[project_ai_coach_idea]]` in memory.

    **Brevo config locked to admin-only, same day.** The user pushed back
    on the original owner-fallback pattern (matching pricing/outgoings)
    once actually using it: entering a third-party API key is a technical
    credential-entry task tied to an account the franchisor sets up on
    the gym's behalf, not a business decision like pricing — no reason
    for a franchisee to touch the raw key, real risk if they do.
    `/api/setup/brevo` now rejects `role !== "admin"` outright (403) at
    both GET and POST; `BrevoConfigView` dropped its `role` prop and
    always shows the gym selector, since only admin ever renders it now.
    Confirmed as the general principle going forward: Setup's *business*
    config (pricing) stays owner-editable with admin fallback; its
    *technical/credential* config (Brevo, and now Resend below) is
    admin-only, no owner access at all.

    **Per-gym Resend config, same session** — the user explicitly wants
    each gym on its own Resend account with its own quota, not one
    shared account (unlike Brevo, which only needed per-gym *config*,
    Resend needed a full second table). Real reason: Resend's free tier
    is a hard 100/day cap, not Brevo's graceful next-day requeue — a
    booking-confirmation email sent after the cap is hit just fails
    outright, so a shared account across a growing franchise risks
    silently dropping member-facing transactional email as volume grows.
    New `gym_resend_config` table (`0037_gym_resend_config.sql`, applied
    and verified live same day), a new "Transactional email (Resend)"
    section on `/setup` (admin-only from the start, no owner-fallback
    detour this time), `src/lib/data/resend-config.ts` +
    `src/lib/validation/resend-config.ts` + `/api/setup/resend`, all
    mirroring the Brevo pattern exactly. One real difference: `from_address`/
    `from_name` are stored as plain text, not encrypted — unlike an API
    key, a sender address isn't a secret, it's visible in every email's
    header.

    Clarified with the user before building: Resend doesn't need a
    separate *account* per gym the way Brevo does (Brevo owns real
    per-franchisee marketing lists; Resend is just transactional
    sending) — one account can hold many verified senders. But the user
    specifically wants separate *quotas*, which does require separate
    accounts, so this went with full per-gym accounts rather than the
    lighter "one shared account, many from-addresses" alternative.
    Auth's own emails (signup confirm, password reset) are explicitly
    **out of scope** — those are sent by Supabase itself via one
    project-wide custom SMTP setting with no per-gym concept at all, and
    stay on the existing shared setup, unchanged.

    **podhq-client changes** (the actual sending side — podHQ only holds
    the encrypted config, it never sends email itself): `src/lib/data/
    resend-config.ts` there is a second, independent copy of the decrypt
    logic (AES-256-GCM, must stay byte-for-byte identical to podHq's
    `secret-encryption.ts` — the two apps are separate repos/deploys, no
    shared package to import from). `sendEmail()` now takes a required
    `gym`, looks up that gym's config, and **falls back to the existing
    shared `RESEND_API_KEY`/`RESEND_FROM_ADDRESS` env vars** if the gym
    has none configured yet — deliberately not a silent no-op like
    Brevo's lead-sync, since a failed booking-confirmation email is
    directly member-facing, not a low-stakes marketing miss.
    `notifyFireAndForget()` now requires `gym` too; every one of its 13
    call sites across 6 files (signup, bookings, cancellations, waitlist
    offers, win-back, and 7 separate sites inside the Stripe webhook)
    updated to pass it through — `gym` was already in scope everywhere
    via `member.gym`/`contact.gym`/`purchaser.gym` or an existing `gym`
    function parameter, so this was mechanical, not a redesign. Found via
    `tsc` itself: making `gym` a required field surfaced every missed
    call site as a compile error rather than relying on manually
    re-grepping the codebase.

    Given the user's own observation that Aylesbury alone is unlikely to
    approach 100 emails/day for a while, there's no urgency to actually
    connect any gym's own Resend account yet — every gym currently rides
    the shared fallback with zero config, exactly as designed, and can
    be switched to its own account whenever it's actually needed (most
    likely once several gyms are running simultaneously, not necessarily
    Aylesbury first).

    Verified live: `0037_gym_resend_config.sql` applied via Supabase's
    SQL Editor, confirmed via a throwaway row-count script (table
    present, 0 rows — matching "every gym still on the shared fallback"
    as expected, nothing connected yet). `npx tsc --noEmit`, `eslint`,
    and `next build` all pass clean in both repos.

24. **Health check endpoint + first regression tests, same day** — the
    user asked for an honest business-analysis of everything built so
    far. Of the risks that came back, two had a real code fix rather
    than a process fix: no automated tests anywhere, and no uptime
    monitoring for either app.

    `GET /api/health` (`src/app/api/health/route.ts`) — deliberately
    unauthenticated (listed in a new `PUBLIC_API_EXACT_PATHS` in
    `src/lib/supabase/middleware.ts`, mirroring podhq-client's already-
    audited exact-path convention rather than a prefix) and unrate-
    limited, since an external uptime monitor needs to hit it without a
    session on a short interval. Checks real Supabase connectivity (a
    cheap `head: true` count query), not just "the process is up" — a
    page that loads but can't reach the DB isn't actually healthy, which
    a plain "hit the homepage" monitor would miss. Returns 503 on DB
    failure so an uptime monitor can alert on it. Verified live against
    the local dev server: 200, real DB check, no auth required. Not yet
    wired to an actual external monitor (UptimeRobot/Better Uptime/etc.)
    — that's a manual signup step outside this codebase.

    **Vitest added to both repos** (`vitest.config.ts`, `npm test`) —
    first test framework either repo has had. `"server-only"` throws
    unconditionally outside Next's own bundler (same issue hit earlier
    this session trying to run a standalone script against
    `src/lib/marketing/brevo.ts`), so both configs alias it to a no-op
    shim (`src/test/server-only-shim.ts`) rather than hitting that wall
    in every future test file.

    **First regression test**: `src/lib/data/pods.test.ts` encodes the
    Critical finding from Stage 22's OWASP audit — `createManualBooking`
    trusting a client-supplied `memberId` with no check it belongs to the
    gym being booked for. Mocks the Supabase admin client rather than a
    real DB; asserts the ownership check rejects a cross-gym member
    *before* `create_booking()` is ever called, not just that the
    end-to-end result looks right.

    **Deliberately not attempted this pass**: the `resolveGym`
    owner/admin-scoping pattern is duplicated near-identically across
    ~12 route files rather than being one shared, tested function — a
    real risk (a fix in one copy doesn't propagate to the other 11), but
    consolidating it into a single tested utility is a real refactor
    that needs its own pass, not something to fold into "add some
    tests." LTV/P&L calculation logic and the rate-limiter's
    concurrency behaviour are similarly not covered yet — both need
    either extraction into pure functions or an integration-style test
    against a real DB to test meaningfully, neither is unit-testable
    as-is. This is a first, deliberately narrow slice, not a claim of
    real coverage.

    `npx tsc --noEmit`, `eslint`, `next build`, and `npx vitest run` all
    pass clean.

    **`resolveGym` consolidation, same day** — the follow-up flagged
    above as the highest-value next piece, done immediately rather than
    left open. Confirmed via grep that all 12 copies were byte-for-byte
    identical (safe to collapse with zero behaviour risk) before
    touching anything. New `src/lib/auth/resolve-gym.ts` — one
    `resolveGym(scope: GymScope, gymParam)` using the `GymScope` type
    `getGymScope` already exported, rather than each route redefining
    the same inline union type — with `src/lib/auth/resolve-gym.test.ts`
    covering the actual security property: an owner's manipulated `gym`
    param naming a real, different gym must still resolve to their own
    gym, not the spoofed one. All 12 route files (`setup/catalog` ×2,
    every `pods/*` route touching a gym-scoped resource) now import the
    shared function instead of carrying their own copy — a fix here now
    propagates everywhere at once, and it's the one copy that's tested.
    `npx tsc --noEmit` passes clean across all 12 call sites, `eslint`
    clean (only 4 pre-existing, unrelated warnings), `next build` and
    `npx vitest run` both clean, and a live smoke test against the
    running dev server confirmed `/api/health` still 200s and
    `/api/pods/settings` still correctly redirects an unauthenticated
    request rather than erroring — the logic itself never changed, only
    where it lives, so this doesn't re-establish live role-based
    verification (still blocked on MFA-scripting), just confirms nothing
    broke at the plumbing level.

25. **Calendar tile redesign + gold restricted to sidebar-only + first
    "premium black gloss" pass** — 2026-08-16, requested while the user
    was away from the keyboard; verified live against an already-
    authenticated session rather than waiting for their return.

    **Calendar** (`src/components/pods/calendar-view.tsx`): Week/Day
    grid cells grew from `h-12` to `h-20`, and now show a "N waiting"
    line when a slot has a waitlist, not just the booking count. A full
    slot (`count >= capacity`) now fills the **whole cell** with a solid
    red background (`bg-danger`, white text) rather than just tinting
    the count text red — a partially-booked slot (capacity > 1, some but
    not all taken) gets a softer amber tint instead of nothing, so three
    states are visually distinct at a glance: empty, partial, full.
    Required a new range-scoped data path since waitlist counts
    previously only existed per-slot-on-click: `getWaitlistCountsForGymAndRange`
    (`src/lib/data/pods.ts`), mirroring `getBookingsForGymAndRange`'s
    existing one-query-per-view-load shape, wired through
    `/api/pods/calendar` (now returns `{bookings, waitlist}`) and a new
    `waitlistCountAt` helper in the component. Month view intentionally
    left as-is — "session tiles" read as the Week/Day per-slot cells,
    not the Month view's per-day aggregate cells, which don't map to a
    single booked/not-booked state the way an individual slot does.

    **Gold restricted to the sidebar only** — the user's read on the
    Stage 20 light-theme work: gold buttons/links scattered across the
    white content area read as inconsistent, and they only ever liked it
    as the sidebar's active-nav treatment. Rather than touching each of
    the ~35 files that reference `accent`-based Tailwind classes
    individually, changed the token values themselves: `--accent`/
    `--accent-hover`/`--accent-foreground` in `globals.css` now resolve
    to near-black/pure-black/white instead of gold, so every existing
    `bg-accent`/`from-accent`/`text-accent-foreground` class across the
    app picks up the new colour automatically via Tailwind v4's
    `@theme inline` (a live CSS-variable reference, not a compile-time
    substitution) — zero touches needed outside `globals.css` for the
    ~35 files. The sidebar alone needed an edit: added dedicated
    `--sidebar-accent`/`--sidebar-accent-hover`/`--sidebar-accent-foreground`
    tokens (the exact gold values `--accent` held before), and
    `app-shell.tsx`'s active-nav-item classes (desktop pill, mobile
    bottom-nav text colour, and the pill's `shadow-[...var(--accent)]`
    glow) were repointed at the new sidebar-specific tokens — the one
    place in the whole edit that had to change per-file.

    **First "premium black gloss" pass** — the user couldn't fully
    articulate the ask beyond "doesn't feel basic Tailwind," so this is
    a deliberately bounded first attempt, not a full redesign, flagged
    to the user as such: `.card-glass`'s shadow deepened (`0 8px 20px
    -6px` instead of a near-invisible `0 1px 3px`) for more lift/
    definition against the white background, and the sidebar/mobile nav
    chrome moved from a flat `bg-sidebar-background` fill to a subtle
    top-to-bottom gradient (`from-[#141414] via-sidebar-background to-black`)
    for a faint gloss highlight rather than plain matte black. Every
    existing black button/pill across the app already gets a matching
    subtle gradient for free, since `bg-gradient-to-r from-accent
    to-accent-hover` was already a gradient class — only the token
    values needed to change, from gold-to-darker-gold to near-black-to-
    pure-black.

    **Verified live** against an already-authenticated browser session
    (MFA blocks scripting a fresh login, same limitation noted
    throughout this project) rather than the usual local-dev-only check:
    confirmed on Dashboard/Setup/Admin/Calendar that the sidebar still
    shows gold on the active nav item, confirmed on Admin's "Create
    account" button that content-area primary buttons are now solid
    black with white text (not gold), and confirmed the Calendar's
    Week-view tiles render visibly larger.

    **Same-session follow-up: red-square/waitlist behaviour confirmed
    live too**, at the user's request while still away from the
    keyboard. Created a throwaway booking + waitlist entry directly
    against production (two real `auth.users` + `members` rows, a
    `create_booking()` RPC call, a `waitlist_entries` insert — same
    "throwaway test member" pattern Stage 15's concurrency test used) for
    Aylesbury Berryfields, screenshotted the result (full slot rendering
    solid red with "1 waiting" beneath it, sent to the user), then fully
    deleted every row created (waitlist entry, booking, credit grant,
    both members, both auth users) and verified nothing remained. Also
    incidentally confirmed the feature against **real, pre-existing**
    bookings already in the data — several other genuinely-booked slots
    in the same week rendered red without any test data involved,
    confirming the logic isn't just correct for the synthetic case.
    `npx tsc
    --noEmit`, `eslint`, `next build`, and `npx vitest run` all pass
    clean.

26. **Shared Supabase Auth config gotcha found and fixed, 2026-08-17** —
    no podHq code changed, but flagged here since it's this app's own
    login flow that was broken. podHq and podhq-client share one Supabase
    project's Auth settings, including a single project-wide **Site URL**
    (used only as a fallback when a requested `emailRedirectTo` isn't in
    the **Redirect URLs** allowlist — not a router). podhq-client's own
    Site-URL fix (getting its confirmation emails off `localhost`, see its
    ROADMAP) set that shared fallback to `https://podhq-client.vercel.app`,
    and only *that* app's callback URL was ever added to the allowlist —
    podHq's own `https://podhq.vercel.app/auth/callback` never was, even
    though `src/app/api/auth/magic-link/route.ts` had always correctly
    requested it (`${origin}/auth/callback`). Result: podHq's "send me a
    link instead" silently redirected to podhq-client's sign-in page
    instead, for as long as this repo has had a magic-link option. Fixed
    by adding podHq's callback URL to the same shared allowlist (Supabase
    dashboard — both apps' URLs coexist there fine, no per-app config
    conflict). Verified live via an admin-generated link
    (`admin.auth.admin.generateLink()`, bypassing the app's own rate
    limiter which had been legitimately tripped by repeated testing) that
    correctly landed on podHq afterward.

    **Real account lockout hit and resolved along the way, structural not
    a one-off**: the admin account (MFA-enrolled) got stuck because
    podhq-client has no MFA support at all (deliberate pilot-scope
    simplification) and Supabase requires an AAL2 (MFA-verified) session
    to change a password on any MFA-enrolled account — so
    podhq-client's own password-reset screen can never complete a change
    for an account that's also a podHq admin/owner, no matter what's
    entered. Resolved by changing the password through podHq instead
    (full MFA support, reaches AAL2 normally) — worth remembering this is
    the only app-side path that can ever fix this specific account's
    password, not a bug to keep re-diagnosing.

27. **Revenue month drill-down, 2026-08-17** — picked up from the prior
    session's explicit "next session" note: `/revenue` only ever offered
    the 5 fixed presets, no way to view one arbitrary specific month.
    Scoped to Revenue only for this pass (confirmed with the user rather
    than assumed) — Member Insights' existing prev/next month stepper is
    a separate, deliberately-untouched control.

    Data layer: `DateRangePreset` gained a `"month"` value;
    `resolveDateRange` clamps any requested month to the last completed
    month server-side (the pipeline never has current-month data — a
    later month would otherwise silently return an all-zero summary that
    reads as a real gap rather than an out-of-range request), and treats
    `"month"` like `"last_month"` for the previous-period comparison
    (both are single-month ranges, just anchored differently). No new
    query path needed for the actual figures — `RevenueRangeSummary`
    already rendered a single month cleanly whenever `range.start ===
    range.end`.

    **UI went through a real revision, not built once and shipped**:
    first pass was 5 pill buttons plus a bare native `<input type="month">`
    inline — functionally fine, but the user disliked it on sight and
    pointed at GymFlow's own Access Logs date-range control (a single
    "Show: [range]" trigger opening a panel with preset shortcuts on the
    left and a calendar on the right) as the actual reference. Rebuilt as
    `date-range-dropdown.tsx`: a single trigger button (calendar icon +
    live range label, same custom-listbox pattern as the existing
    `GymSelect`, click-outside-to-close) opening a panel with the 5
    presets as a vertical list on the left and a month-grid (not a full
    day calendar — Revenue data is month-granularity only, a day picker
    would offer nothing a day-level date can't back) on the right,
    year-navigable via arrows. The year heading text is itself clickable
    to jump straight to "Full year" for that year, rather than a second,
    redundant year `<select>` sitting alongside the month grid.

    **Real bug caught before it shipped, not live**: the year-heading
    click was originally wired as two separate callbacks fired back to
    back (`onPreset("full_year")` then `onYear(year)`) — each one trigger-
    ing the parent's own `refetch` off its *own* render's closure values,
    so the first call would refetch using the still-stale `year` state
    and the second would refetch using the still-stale `preset` state
    (React state updates don't apply mid-function-body — a classic stale-
    closure trap, not something a type-check or lint pass catches).
    Fixed by collapsing it into one combined `onSelectYear` callback that
    sets both pieces of state and calls `refetch` exactly once with the
    correct combined values.

    Also fixed along the way: the dropdown trigger itself was originally
    gated on `summary` being non-null, meaning a failed fetch (bad
    network, transient error) would hide the *only* control that could
    let the user pick a different filter to recover — moved the
    displayed range into its own `range` state, updated only on a
    successful fetch, so the trigger survives an error independently of
    the rest of the page clearing.

    `npx tsc --noEmit`, `eslint`, `next build`, and `npx vitest run` all
    pass clean. **Not click-tested live** — podHq's login requires MFA,
    which can't be scripted (same limitation noted throughout this file);
    verified via local dev server startup + full build only, pushed to
    production on the user's own explicit go-ahead after describing the
    change rather than a live click-through.

28. **`/setup`'s three gym pickers merged into one, 2026-08-18** — surfaced
    while scoping Hove's onboarding (new per-gym Resend + Brevo accounts,
    each gym registered as its own business, subdomain DNS per gym). User
    spotted it live via screenshot: `/setup`'s Catalog, Brevo, and Resend
    cards each held their own independent gym-selector state, so picking
    Hove in one did nothing for the other two — real busywork exactly when
    onboarding touches all three in one sitting.

    New `src/components/setup/setup-shell.tsx` owns a single `gym` state
    and the page's only `GymSelect`; `CatalogView`, `BrevoConfigView`, and
    `ResendConfigView` all changed from managing their own `gym`
    state (with their own internal selector) to a plain controlled `gym`
    prop from the shell. `CatalogView` keeps its existing "Setup — {gym}"
    heading (shared by both roles); the shell adds nothing extra for an
    owner, whose gym is fixed with no selector at all, unchanged from
    before.

    **Real lint fix needed, not just a mechanical prop change**: switching
    Brevo/Resend from "fetch on selector onChange" to "fetch via
    `useEffect` on a `gym` prop change" tripped `react-hooks/set-state-in-
    effect` (the same stricter `eslint-plugin-react-hooks` from the
    2026-08-16 dependency upgrade) — calling `load()`'s synchronous
    `setLoading`/`setConfig` directly from the effect body. Fixed with this
    project's own already-established pattern for exactly this
    (`calendar-view.tsx`'s `fetchRange`): `queueMicrotask(load)` inside the
    effect. `CatalogView`'s equivalent effect needed no such fix — its
    existing first-render guard (skip refetch on mount, only refetch on a
    later change) was already enough to keep the linter satisfied.

    **Live-verified** against local dev (after two unrelated environment
    snags fixed along the way, not app bugs: a stale MFA-incomplete
    session left over in the browser profile from earlier testing —
    logged out via a real `POST /api/auth/logout` call, since the route
    only accepts POST and a plain GET navigation silently no-ops; then a
    stale unversioned JS chunk cached by Chrome from a previous day's dev
    server, mismatched against the freshly-restarted server after clearing
    `.next` — a hard reload fixed it, no code change involved). With a
    real admin session, selecting **Hove** in the one shared selector
    correctly scoped all four sections at once: "Setup — Hove", empty
    Credit packs/Membership tiers, and both Brevo/Resend showing "not
    connected for this gym yet" with live Connect buttons. `npx tsc
    --noEmit` and `eslint` pass clean on all changed files.

    Hove's actual Resend/Brevo account creation itself is still pending —
    this only fixed the setup page's own UX gap ahead of doing that.

    **Same-day follow-up: real infrastructure bug found and fixed while
    actually using the fixed page.** The very first live Save attempt (Hove's
    Brevo card) returned "Something went wrong" with no useful detail —
    traced via `vercel logs` (Vercel CLI, already authenticated from prior
    `vercel --prod` deploys) to a genuine 500: `SECRET_ENCRYPTION_KEY is not
    configured`. That variable had **never been added to podHq's Production
    environment at all** — confirmed via `vercel env ls production`, not
    assumed — meaning every per-gym Brevo/Resend save had been silently
    broken in production since the feature shipped 2026-08-16; nothing had
    ever hit this failure before because nothing had ever been saved
    successfully, hence `gym_resend_config`/`gym_brevo_config` still showing
    0 rows in every prior verification note. Checking further found
    **podhq-client's Production environment was missing the same variable
    too** — it never had one, since it only started needing it once this
    feature existed. Both matter: podHq encrypts (and, for Brevo only, also
    decrypts, since podHq itself syncs to Brevo directly) while podhq-client
    decrypts Resend configs specifically to send real member-facing email —
    Brevo is never touched by podhq-client at all.

    Fixed by generating a fresh key and adding it to both projects' Vercel
    Production env plus both local `.env.local` files, then redeploying
    both (`vercel --prod` doesn't retroactively apply new env vars to an
    already-running deployment — a fresh one is required). The key ended up
    rotated twice more after that, unrelated to the underlying bug: the
    VS Code Claude Code extension surfaces whatever text is selected/
    cursor-adjacent in an open editor tab as conversation context
    automatically, and `.env.local` being open in VS Code during this
    session leaked the value into chat twice by accident (once via a
    highlighted line, once via just cursor movement) — worth remembering
    for any future secret-rotation work done with that extension active:
    close the file, don't just avoid deliberately pasting it.

    **Fully live-verified after the real fix**: both Brevo (list ID 2) and
    Resend (`hello@hove.myfitpod.co.uk`) saved for Hove — confirmed via
    `vercel logs` showing real `POST /api/setup/brevo` and
    `POST /api/setup/resend` requests returning 200 in production, not just
    trusting the UI's own success state. Hove's actual DNS verification
    (SPF/DKIM for `hove.myfitpod.co.uk`) is still outstanding, so real sends
    through Hove's own Resend account won't work until that's done — but
    the stored config itself is confirmed correct and encrypted.

29. **Stripe Connect — Hove pilot (per-gym payment separation), 2026-08-19** —
    built at the user's request: today every gym shares one Stripe account,
    which has no concept of "which gym" a payment belongs to at all, only
    reconstructed after the fact from `member.gym`. The user wants real
    per-gym separation (own balance, own payouts, franchisees able to
    refund their own clients directly), via Stripe Connect, piloted on
    **Hove** first since it isn't open yet. Full detail (including
    podhq-client's half — checkout/webhook routing) lives in its own
    ROADMAP.md; this entry covers podHq's half.

    Confirmed with the user before building: Hove has no existing Stripe
    account, so this uses **Connect Onboarding** (a brand-new Standard
    account) rather than OAuth-linking an existing one; connecting a gym
    is **admin-only** in `/setup`, same pattern as the existing Resend/
    Brevo cards; **direct charges**; and **franchisees must be able to
    refund their own clients from podHq** — the one hard requirement.
    `src/app/api/pods/refund/route.ts` already scoped an `owner` correctly
    to their own gym (`lookup.memberGym !== scope.gym` → 404); the only
    real gap was `stripe.refunds.create()` always hitting the platform
    account regardless of which Stripe account actually processed the
    payment.

    `supabase/migrations/0040_gym_stripe_config.sql` (written and
    **applied 2026-08-19**) — `gym_stripe_config`: `gym` (unique), `stripe_account_id`
    (not a secret, unlike the Resend/Brevo keys — no encryption needed,
    unlike `secret-encryption.ts`), `onboarding_complete`. A gym with no
    row (every gym today) falls back to the shared platform account
    exactly as before — not a breaking change for anyone but Hove.

    `src/lib/data/stripe-connect-config.ts` — `startStripeConnectOnboarding`
    creates the Standard account + a fresh Account Link,
    `completeStripeConnectReturn` re-checks `details_submitted` against
    the real Stripe object rather than trusting the redirect alone (same
    "don't trust the redirect, check real state" reasoning podhq-client's
    own Stripe Checkout `success_url` already established),
    `getStripeAccountId` is the read used by the refund route below. New
    `GET/POST /api/setup/stripe-connect` (admin-only, same
    `getGymScope`/rate-limit pattern as `/api/setup/resend`) and its
    `/return` callback route, which Stripe's Account Link redirects back
    to. New `StripeConnectView` card in `/setup`'s `SetupShell`, next to
    Resend/Brevo. New `setup_stripe_connect_started` added to
    `AuthEventType` in `src/lib/audit.ts` — no migration needed, same as
    every prior addition to that union, since `auth_events.event_type`'s
    CHECK constraint was dropped back in `0006_auth_events_lockout_reset.sql`.

    `src/app/api/pods/refund/route.ts` now looks up the paying gym's
    `stripe_account_id` via the same `stripe-connect-config.ts` and passes
    `{ stripeAccount }` into `stripe.refunds.create()` when present — no
    role/scoping change needed, the existing owner-locked-to-own-gym check
    already did the right thing, this only fixes *which* Stripe account
    the refund call actually hits.

    **Flagged, not built this pass**: the staff "charge card on file" sell
    panel (`/pods/members/[id]`, Stage 21) stays platform-account only — a
    saved card lives on the platform account's Customer object today, and
    charging it against a connected account instead is a separate, larger
    change (Customer/payment methods don't automatically carry over
    between Stripe accounts).

    **All four manual steps done, and Hove is genuinely connected —
    live-verified 2026-08-19.** Migration applied; Connect enabled on the
    platform account (Standard, direct funds flow, Stripe-hosted
    onboarding); a fresh restricted key created under the **new**
    `admin@myfitpod...` platform account specifically (not the old
    Aylesbury-tied test key this app had been using since the pilot) with
    `Charges: read`, `Refunds: write`, `Accounts: write`, `Account Links:
    write`; webhook "listen to connected accounts" not yet toggled (no
    live payment tested yet, only account creation/onboarding — flagged
    below). Connected Hove through the real `/setup` UI, completed
    Stripe's hosted onboarding with test data (UK test sort code `10-88-00`
    / account `00012345`, from Stripe's own documented test-bank-account
    list — a plausible-but-fake sort code fails Stripe's own format
    validation even in test mode).

    **Real bug found and fixed during this test**: `src/lib/supabase/
    server.ts` and `src/lib/supabase/middleware.ts` both set session
    cookies with `sameSite: "strict"` — this app had never hit the failure
    mode before (no prior feature sent the browser on a top-level
    cross-site redirect and back), but Stripe Connect's Account Link
    return_url is exactly that, and Strict cookies are silently withheld
    by the browser on the way back, logging the admin out mid-flow.
    **Same bug class podhq-client already found and fixed in its own Stage
    4** (Stripe Checkout's success_url redirect) — should have been
    applied here proactively when this feature was built, not found
    reactively. Fixed by switching both to `sameSite: "lax"`.

    That cookie bug meant the onboarding-complete signal never reached
    `completeStripeConnectReturn` on the first real attempt, even though
    Stripe's own account was genuinely fully onboarded — confirmed by
    querying Stripe directly (bypassing the browser entirely, via a
    throwaway script using the same `node --env-file=.env.local` pattern
    as `reset-pilot-password.mjs`): `details_submitted: true,
    charges_enabled: true, payouts_enabled: true`, zero outstanding
    requirements, for `acct_1U6B6KPLmj2HICwn`. `gym_stripe_config`'s
    `onboarding_complete` was out of sync with that real state (still
    `false`) — synced directly to `true` by the same script rather than
    re-doing the onboarding form a second time. Script deleted after use.

    **A separate, real hydration bug in `/setup` was also found this
    session, not yet root-caused or fixed** — `SetupShell` mismatches on a
    cold/fresh load specifically when `initialGym` is `null` (an admin's
    first load before picking a gym), reproducible independent of any dev-
    server restart. Non-fatal (React recovers and the page still works,
    confirmed live), but flagged as real outstanding work, not swept under
    the stale-bundle explanation that covered the *other* symptoms this
    session.

    **Also still outstanding, not built this pass**: linking an
    **existing** Stripe account (OAuth), for a franchisee who already has
    one rather than needing a brand-new Connect Onboarding account created
    for them — Hove specifically had no existing account so this wasn't
    needed for it, but it's a real gap for future gyms and was raised
    directly by the user during this session. `npx tsc --noEmit` and
    `eslint` pass clean on the cookie fix.

    **Clarified 2026-08-20 while setting up webhooks: podhq-client has no
    live payment traffic yet at all** — GymFlow is still the real,
    live payment system for every gym; podhq-client hasn't launched for
    any of them, and Hove is the only gym in this Connect pilot. An
    earlier note in this same session wrongly assumed other gyms had
    real checkout traffic depending on the shared platform-account
    webhook right now — corrected directly by the user. The stated
    go-forward plan is every future gym onboards via its own Connect
    account from day one, so the platform-account fallback path in the
    code (`getGymStripeAccountId` returning `null`) may end up rarely or
    never exercised for real traffic. Decision: **only the Connect
    ("Connected accounts") webhook endpoint is being set up for this
    pilot** — the "Your account" platform endpoint is deferred, not
    urgent, since nothing live depends on it today. Add it later only if
    a real gym actually ends up needing the platform fallback path.

    **Restricted-key permissions scoped 2026-08-20, neither key created
    yet.** A prior session (lost mid-discussion to a power cut before it
    reached ROADMAP.md or a commit) worked out the permission split for
    the two per-app restricted keys this feature needs — recovered by
    re-deriving it directly from what each app's code actually calls
    (`grep` for every `stripe.<resource>.<method>` call site in both
    repos), not from memory of the lost conversation. The requirement,
    confirmed by the user same-session: each connected gym must charge
    its own clients with the money landing in *that gym's own* Stripe
    balance — already satisfied by the direct-charge design (`checkout`
    passes `{ stripeAccount }`, the webhook replies via `event.account`,
    `/api/pods/refund` already routes through the paying gym's account),
    this note is just the key permissions that design needs to actually
    run.

    **Live-dashboard permission model, confirmed by the user via a
    screenshot of the real "Create restricted API key" screen (this
    took three corrections to land on — documented in full for whoever
    hits this next):** the screen has two separate columns, each its
    own full **None / Read / Write** button-set — "PERMISSIONS" (direct/
    platform-account requests) and "CONNECT PERMISSIONS" (requests made
    with the `Stripe-Account` header, i.e. against a connected account).
    It is **not** a single setting, and **not** a checkbox/tick next to
    the normal permission either — it's a second, independent None/Read/
    Write selector that has to be set explicitly per resource. The
    screenshot also confirmed Accounts v2's CONNECT PERMISSIONS column
    is greyed out/disabled — some resources genuinely have no
    connected-account version, consistent with Accounts/Account Links
    below.

    **podHq's key** (`src/lib/stripe.ts` — staff sell/comp panel +
    refunds + Connect account management): for Checkout Sessions,
    Coupons, Payment Intents, Products, Subscriptions, Refunds — click
    **Write** in both the PERMISSIONS and CONNECT PERMISSIONS columns,
    since every one of these now runs against a connected account
    whenever the target gym has one (see the `sales.ts` fix directly
    below). Customers — **Read** in both columns. Accounts and Account
    Links — **Write** in PERMISSIONS only; their CONNECT PERMISSIONS
    column is expected to be greyed out (Connect account creation/
    onboarding is inherently a platform-only operation). No `Charges`
    permission is actually required by any code path (`refunds.create`
    takes a `payment_intent`, not a charge) despite this app's doc-
    comment previously saying "Charges: read, Refunds: write" — that
    comment predated Stage 21's sell/comp panel and has now been
    corrected in `stripe.ts` directly.

    **podhq-client's key** (`src/lib/stripe.ts` — member-facing checkout
    + webhook): Checkout Sessions, Customers, Subscriptions — **Write**
    in both columns (self-service checkout already routes through
    `stripeAccount` for a connected gym). Invoice Payments, Payment
    Intents — **Read** in both columns (both are read back inside the
    webhook via `connectRequestOptions` when `event.account` is set). No
    Refunds permission needed at all — refunds are only ever issued
    from podHq's `/api/pods/refund`, this app only reacts to the
    resulting `charge.refunded` webhook event to
    correct the ledger.

    **Real gap found and fixed same day: `src/lib/data/sales.ts` (the
    staff sell/comp panel) never routed through a gym's connected
    account at all** — unlike `refund/route.ts` and podhq-client's
    `checkout/route.ts`, none of its Stripe calls passed `stripeAccount`.
    The user's explicit requirement, stated directly: whichever gym is
    selected — even by admin, who can act on any gym — every charge,
    pack sale, and membership for that gym's members must happen inside
    *that gym's own* Stripe account, with no exception for staff-
    initiated sales. Fixed by threading `getStripeAccountId(gym)`
    through every Stripe call in the file (`checkout.sessions.create`/
    `.retrieve`, `coupons.create`, `customers.retrieve`,
    `paymentIntents.create`, `products.create`, `subscriptions.create`)
    via a new local `stripeRequestOptions()` helper — same
    `{ stripeAccount }` pattern already used correctly by
    `refund/route.ts` and podhq-client's `checkout/route.ts`. This
    includes the "charge card on file" paths
    (`chargeSavedCardForPack`/`createMembershipWithSavedCard`/
    `getSavedPaymentMethod`), which an earlier draft of this note
    wrongly assumed had to stay platform-account-only — they don't: a
    Connect-enabled gym's member has their Stripe Customer created
    fresh under that gym's own connected account from their very first
    purchase (Hove has zero pre-Connect purchase history), so retrieving
    that Customer *without* `stripeAccount` would 404, not silently
    charge the wrong account. The only real edge case is a gym that
    connects *after* already having platform-account customers — that
    would strand their existing `stripe_customer_id`s on the wrong
    account and needs an actual migration, not just this lookup, before
    card-on-file works for those specific members; not a concern for
    Hove, flagged here for whichever gym hits it next. `npx tsc --noEmit`
    and `eslint` pass clean on the changed file.

    **Not yet done**: neither key has actually been created in Stripe's
    dashboard yet (the user's preference is doing this by hand, not via
    API/CLI — see `[[feedback_manual_over_automated_admin_actions]]`).
    When they are, mind the key-swap-between-apps mistake this project
    has hit twice already (Stage 17's Stripe keys, Stage 28's
    `SECRET_ENCRYPTION_KEY`) — podHq gets the Accounts/Account Links
    key, podhq-client does not. Also not yet live-tested — a Hove staff
    sale end-to-end, confirming the resulting Checkout Session/
    PaymentIntent/Subscription actually appears in Hove's connected
    Stripe account rather than the platform account.

    **Also recovered from the same lost session, found still sitting
    uncommitted on disk in podhq-client** (survived the power cut since
    it was already saved to disk, just never committed):
    `src/app/api/webhooks/stripe/route.ts` gained a fallback verification
    path against a second `STRIPE_WEBHOOK_SECRET_CONNECT` env var — a
    connected account's direct-charge events arrive at a *separate*
    webhook endpoint (Stripe's "Connect" endpoint flag can't be toggled
    on an existing one) with its own signing secret, so the existing
    single-secret check would reject every Connect event otherwise. Still
    needed before this can go live, on top of the two keys above: create
    that second webhook endpoint in Stripe's dashboard ("Listen to events
    on connected accounts", same URL as the existing endpoint) with
    `checkout.session.completed`, `payment_intent.succeeded`,
    `customer.subscription.created`, `customer.subscription.updated`,
    `customer.subscription.deleted`, `invoice.payment_succeeded`, and
    `charge.refunded` selected, then add its signing secret as
    `STRIPE_WEBHOOK_SECRET_CONNECT` to podhq-client's `.env.local` and
    Vercel Production env.

    **Fully live-verified end-to-end 2026-08-20**, closing out this
    session's work. Both restricted keys created (permissions per the
    tables above, each resource set in both the PERMISSIONS and CONNECT
    PERMISSIONS columns — confirmed via live screenshots of the actual
    dashboard, not assumed); a Connect-only webhook endpoint created
    (the platform "Your account" endpoint deferred — see the note above,
    nothing live depends on it yet since podhq-client hasn't launched
    for any real gym and GymFlow is still the live payment system).
    Local dev servers restarted with the new keys.

    Real bug caught and fixed along the way, unrelated to Connect
    itself: the member profile page (`getMemberProfile`, `pods.ts:256`)
    called `get_credit_balance` with only `p_member_id`, which had
    become ambiguous after `0039_pod_resources_functions.sql` added a
    second overload with a defaulted `p_credit_type` — Postgres treats
    differing parameter counts as separate overloads regardless of
    defaults, so the old 1-arg function was never actually replaced as
    0039 assumed, and PostgREST couldn't resolve which to call
    (`PGRST203`). Fixed via `0041_fix_get_credit_balance_overload.sql`
    (drops the old overload; no application code changes needed), found
    by reading the dev server's actual terminal output rather than just
    the browser's truncated error overlay.

    A throwaway test member ("Hove Connect Test", gym: Hove) was created
    directly via script (same pattern as prior sessions' throwaway test
    accounts) to work around two local-only blockers: signup requires
    email confirmation, and podhq-client's self-service `/book` page
    can't be tested in the same browser as a logged-in podHq admin
    session (cookies aren't port-scoped on localhost — same known quirk
    documented in Stage 17). Testing went through podHq's own staff
    sell panel instead (`/pods/members/108` → Sell a pack → Hove's
    "Stripe Connect Live Test" £1.00 catalog item → Discount/Full price
    → embedded Checkout → real Stripe test card `4242 4242 4242 4242`).

    **Confirmed directly in Stripe's dashboard, not just a 200
    response**: the £1.00 payment appears under Hove's own connected
    account ("Carl Simpson Coaching") — its own balance (£0.77 after
    Stripe's fee), its own Payments list, its own lifetime volume —
    not the platform account. This is the core requirement from this
    entire session ("each connect gym must charge its own clients with
    the money landing in that gym's own account") confirmed working
    end-to-end for a real Stripe transaction.

    **Credit ledger side fully verified same day, closing out this
    thread.** Getting here took two more real bugs, both found via
    production logs rather than guessed:

    - **Client-side Stripe.js had no connected-account context.**
      Server-side session creation already passed `stripeAccount`, but
      `sell-panel.tsx`'s embedded Checkout used a static module-level
      `loadStripe(publishableKey)` with no account context — Stripe.js
      itself needs to know which connected account a session belongs
      to, separately from the server-side call that created it. Found
      via the exact production error ("provided key does not have
      access to account..."). Fixed: `createPackCheckoutSession`/
      `createMembershipCheckoutSession` now return `stripeAccountId`
      alongside `clientSecret`, threaded through the API route into
      `sell-panel.tsx`, which builds its Stripe.js instance dynamically
      (`useMemo` keyed on `stripeAccountId`) instead of once at module
      load.
    - **`STRIPE_SECRET_KEY` had a stray leading `=` character** in both
      `.env.local` and Vercel (`=rk_test_...` instead of `rk_test_...`)
      — a copy-paste slip that made every podHq Stripe call fail with
      "Invalid API Key provided," surfacing as a full page crash on the
      member profile (the saved-card lookup happens during page load,
      so an invalid key there took the whole page down, not just the
      sell panel). Found by reading the literal string Stripe's API
      rejected in the production error log. Fixed by the user correcting
      the value in both places and redeploying.

    **Verified directly against the database, not just the UI**, for
    the same Hove Connect Test member (id 108) used throughout this
    session: exactly one `credits` row — `amount: 1`, `reason:
    'purchase'`, `credit_type: 'pod'`, `catalog_item_id:
    'stripe-connect-live-test'`, a real `stripe_payment_intent_id` — and
    `members.stripe_customer_id` populated, matching the "card on file"
    shown in the UI. This confirms the full chain end-to-end: Checkout
    Session created against Hove's connected account → payment
    succeeded → the Connect webhook endpoint correctly verified the
    signature and processed the event → credit written to the ledger →
    card captured for next time. This was the last unverified piece of
    the entire Stripe Connect thread — the pilot now works fully,
    top to bottom, for a real Stripe test-mode transaction.

30. **Hove's real pricing catalog uploaded** — 2026-08-20, same session.
    User supplied `MyFitPod_Hove_Pricing_Aug2026.xlsx` (read directly via
    Python's stdlib `zipfile`/`xml.etree` — no third-party dependency
    installed, since the file is just XML in a zip) covering PAYG rates,
    monthly session packs, a competitive analysis, and a Founding Member
    offer. 22 catalog items created for Hove via a script mirroring
    `createCatalogItem`'s exact insert shape (slugify + dedup logic),
    since going through `/setup`'s UI by hand for 22 items wasn't
    practical and the user asked to upload the data directly instead.

    **Confirmed with the user before writing anything** (four real
    judgment calls, not assumed):
    - The sheet's "Monthly Session Packs" (Silver/Gold/Platinum,
      5/10/20 sessions) are real recurring Stripe subscriptions
      (`type: "membership"`), not one-time packs — chosen over the
      simpler one-time-pack alternative.
    - The 4 "Combo" packs (gym+recovery bundled, e.g. "5+5 Silver"
      £112) can't be one catalog item — `credit_type` is a single field
      per item (`pod` or `recovery`, confirmed in `catalog.ts`'s own
      comment: only those two exist, both from this same Hove work).
      Resolved by splitting each combo into two linked items (a gym
      half + a recovery half) whose prices are allocated
      **proportionally to each component's own standalone rate**, so
      the pair always sums exactly back to the combo's real price —
      e.g. Silver 5+5 (£112 total): standalone Gym Silver £65 +
      Recovery Silver £60 = £125, so gym's share = 65/125×112 = £58.24,
      recovery's share = 60/125×112 = £53.76. Applied identically to
      the Gold combo and both PAYG combo rates (Solo, Two people).
    - PAYG single-session rates also added as real 1-credit
      `credit_pack` items (Gym pod Solo/Two people/Pro-PT, Recovery
      room Solo/Two people), so a member wanting one session isn't
      forced into a multi-session pack.
    - The Founding Member Offer sheet (lifetime 20%-off-forever perk
      for early waitlist conversions) was explicitly **not** built —
      there's no discount-code/permanent-perk mechanism anywhere in
      the catalog today, and inventing one wasn't in scope for a
      pricing upload. Flagged here as a real future ask if the user
      wants to actually run that promotion.

    **PT credit-type call confirmed by the user, same day**: PT items
    renamed from "PT/Pro" to plain "PT" (four items —
    `pt-pro-silver`/`-gold`/`-platinum` memberships and
    `gym-pod-pro-pt` credit pack; slugs unchanged, only the display
    `name`/`label` updated, matching `updateCatalogItem`'s own
    behaviour of never touching the stable slug). `creditType: "pod"`
    (shared with ordinary gym credits, not a separate pool) is
    confirmed correct, not just assumed.

    Not yet visually confirmed against the live `/setup` UI as of
    writing this note — the insert script's own per-item console output
    is the only verification so far.

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

**`0040_gym_stripe_config.sql` written and applied 2026-08-19**
(per the shared-schema rule — flagged on both sides): new table,
`gym` (unique) / `stripe_account_id` / `onboarding_complete`, for the new
Stripe Connect per-gym payment separation feature (Stage 29 above). Not a
secret column — `stripe_account_id` is visible in Stripe's own Dashboard
UI — so no encryption, unlike `gym_resend_config`/`gym_brevo_config`'s
`api_key_encrypted`.

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
