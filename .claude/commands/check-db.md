---
description: Test Supabase connection and show table row counts
---
Write and run a temporary Node script that connects to Supabase using the service key from environment variables, queries each table (Revenue, attendance, users_gyms, ad_spend), and prints the row count for each. Delete the script after running. Do NOT read .env.local — use process.env to access the variables (they must already be loaded, e.g. via `node -r dotenv/config` or the shell environment).
