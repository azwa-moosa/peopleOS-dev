# Hosted demo: Netlify (web) + Render (API + database)

Netlify only runs the Next.js web app. The API, audit relay and PostgreSQL run on Render.
**Synthetic data only** – never load real employee data into this demo.

## 1. Render – API and database (about 10 minutes)
1. Push the repository (including `render.yaml`) to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo → **Apply**.
   Render creates `bml-people-er-db` (PostgreSQL 16) and `bml-people-er-api`, generates the secrets, runs the migrations and seed, and starts the API.
3. When the API is live, open `https://<your-api>.onrender.com/ready`. Expect
   `{"status":"ready","migrations":4,"singleRoleMode":false}`.
   `singleRoleMode: true` means the host refused to create the restricted `app_runtime` database role: the demo still works and the API still enforces every permission, but the database-level row security backstop is off. Fine for a demo; not acceptable for UAT/PROD.

## 2. Netlify – point the web app at the API
1. Site configuration → **Environment variables** → add `API_BASE_URL` = `https://<your-api>.onrender.com` (no trailing slash).
2. **Deploys → Trigger deploy → Clear cache and deploy site.**
3. Open the site. The first load after a quiet period can take ~1 minute while Render wakes the API; refresh if you see "API unavailable".

## Limits of the free tiers
| Item | Limit |
|---|---|
| Render free Postgres | Expires 30 days after creation (14-day grace to upgrade), 1 GB |
| Render free web service | Sleeps after 15 minutes idle; ~1 minute to wake |
| Background worker | Not free on Render → the audit relay runs inside the API (`EMBEDDED_OUTBOX_RELAY=true`) |

## Before sharing the link
The DEV persona sign-in has **no password** by design. Anyone with the URL can sign in as any persona. Before sharing beyond yourself:
- turn on Netlify password protection (or Netlify Identity / Cloudflare Access in front of the site), and/or
- replace real colleague names in `packages/synthetic-data/src/index.ts` with invented ones.

## Reset the demo data
Render → `bml-people-er-api` → **Shell**: `PLATFORM_ENV=dev pnpm db:reset`
