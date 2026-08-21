@AGENTS.md
@ROADMAP.md

# PodHQ — Project Rules

## Stack
- Next.js 14+ (App Router, TypeScript, Tailwind CSS)
- Supabase (Postgres, Auth, RLS)
- Recharts for charts
- Deployed on Vercel

## Session handoff
- `ROADMAP.md` is `@`-imported into every session and capped at ~15,000
  characters (Claude Code's import limit) — it holds only a condensed
  one-line-per-stage index plus the live reference tables (DB schema,
  pipeline rules, gym names). Full session write-ups go in
  `ROADMAP_HISTORY.md` instead, which is not auto-loaded.
- Before any `git commit`/`git push` that wraps up a working session, append
  a summary of that session to `ROADMAP_HISTORY.md` (matching its existing
  per-stage style: what changed, why, and what's verified vs. still
  outstanding), and add or update the matching one-line entry in
  `ROADMAP.md`'s stage index — so the next session opens with full context
  on where things left off, without needing to reconstruct it from the diff
  or chat history.
- Keep it proportionate: a small fix can be a sentence or two appended to the
  relevant entry in `ROADMAP_HISTORY.md`; a new feature gets its own stage
  entry in both files.
- If an edit ever pushes `ROADMAP.md` back over ~15,000 characters, trim it
  further (tighten the index, move more reference detail to
  `ROADMAP_HISTORY.md`) rather than letting it silently exceed the import
  limit again.

## Conventions
- All components: functional, TypeScript, named exports
- File naming: kebab-case for files, PascalCase for components
- API routes: all in /app/api/, server-side only, validate session on every route
- Supabase: use service key server-side only, never expose to client
- Styling: Tailwind only, no CSS modules, no styled-components
- Currency: GBP (£), 2 decimal places, thousands separator
- British English in all UI copy

## Security Rules (NON-NEGOTIABLE)
- NEVER read, display, log, or reference the contents of .env.local or any .env* file
- NEVER hardcode API keys, secrets, or credentials anywhere in the codebase
- All Supabase calls go through API routes — no client-side Supabase queries in production
- All API routes must validate the user session before returning data
- RLS must be enabled on every table with data

## Code Quality
- No `any` types — use proper TypeScript interfaces
- All API responses typed
- Error boundaries on every page
- Loading states on every data fetch
- No console.log in production code — use proper error logging
