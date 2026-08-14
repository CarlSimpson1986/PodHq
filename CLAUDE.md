@AGENTS.md
@ROADMAP.md

# PodHQ — Project Rules

## Stack
- Next.js 14+ (App Router, TypeScript, Tailwind CSS)
- Supabase (Postgres, Auth, RLS)
- Recharts for charts
- Deployed on Vercel

## Session handoff
- Before any `git commit`/`git push` that wraps up a working session, add a
  short summary of that session to `ROADMAP.md` (matching its existing
  per-stage style: what changed, why, and what's verified vs. still
  outstanding) — so the next session opens with full context on where things
  left off, without needing to reconstruct it from the diff or chat history.
- Keep it proportionate: a small fix can be a sentence or two appended to the
  relevant stage; a new feature gets its own stage entry as usual.

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
