# Release checklist

How a release reaches production: Neon (Postgres 18, Singapore), Render (the API, one Docker web service, free tier) and Vercel (the built client, proxying `/api` to Render). No secrets in this file: variables are listed by name only. Neon specifics (project, direct vs pooled, measurements, backups) are in [NEON.md](NEON.md).

```
browser ──https──> Vercel (client/dist, client/vercel.json) ──/api/*──> Render (Docker, server) ──TLS──> Neon (direct endpoint)
```

## 0. Before you start

- [ ] The release branch is merged into `main`, and on a clean checkout `npm ci`, `npm run lint`, `npm test` and `npm run build` pass against a fresh local database.
- [ ] The GitHub repository is **private**.
- [ ] You know which migrations are new in this release (`git diff --name-only <last release>..main -- server/db/migrations`). They are additive and never edited after they are applied.
- [ ] A backup exists from today (section 7). Neon Free keeps only 6 hours of history.

## 1. Migrations first (from your own PowerShell, Neon direct URL)

Migrations always run **before** the code that needs them, by hand, from your machine. Never from a test, the seed, or a build step.

1. Neon Console > `hm-internal` > **Connect** > branch `main`, database `hm_internal`, role `hm_app`, **Connection pooling off** (direct). Copy the string.
2. In a new PowerShell window at the repo root, on the commit you are releasing:
   ```powershell
   git checkout main; git pull
   npm ci
   $env:DATABASE_URL = "<paste the direct string>"
   $env:DB_CONNECTION_TIMEOUT_MS = "30000"
   npm run db:migrate
   ```
   It prints each file it applies (`Applied N migration(s).`). Run it again: it must print `No pending migrations.`
   This round adds `010_password_tokens`, `011_company_logo` and `012_employee_working_hours` (all additive).
3. Once only, if not done yet: make Neon enforce the statement timeout (Neon drops the one the app sends at connect time, see NEON.md):
   ```sql
   ALTER ROLE hm_app SET statement_timeout = '15s';
   ```
   Run it in the Neon SQL Editor on `main`. New connections pick it up; `SHOW statement_timeout;` from a fresh connection shows `15s`.
4. Close the window (the variable dies with it). Never put the Neon string in `.env`.

The new tables and columns are unused by the old code, so the running (old) Render service keeps working between this step and the deploy. `GET /api/health/ready` answers 503 `migrations: pending` until every file in the image has been applied: that is the gate in step 3.

## 2. Render (API)

Service: Docker web service from this repository (`Dockerfile`), branch `main`. Settings to check:

- **Health check path:** `/api/health/ready`. A deploy whose migrations were not applied never becomes live.
- **Auto-deploy:** off, so a merge does not deploy before the migrations. Deploy by hand: **Manual Deploy > Deploy latest commit**.
- **Shell** (for `hm-entrypoint mail-test`, `create-admin`): available on paid instances only; on free, run those from your machine with the production variables in a PowerShell window, like step 1.

Environment variables (names only):

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **direct** string (pooling off) |
| `SESSION_SECRET` | 32+ random characters; changing it signs everyone out |
| `APP_URL` | the public origin users open, e.g. `https://internal.hybridmonks.com`: https, no path, no trailing slash. Every email link is built from it |
| `TRUST_PROXY` | `2` behind Vercel + Render (section 5) |
| `RESEND_API_KEY` | Resend key with sending access only (`re_...`). Render free blocks SMTP |
| `SMTP_FROM` | sender address on the Resend-verified domain, e.g. `no-reply@hybridmonks.com` |
| `EMAIL_FROM_NAME` | display name, default `Monks Internal Management` |
| `SMTP_REPLY_TO` | optional: a monitored inbox for replies |
| `DB_POOL_MAX` | suggest `5` |
| `DB_CONNECTION_TIMEOUT_MS` | suggest `15000` (covers a Neon wake-up from scale to zero) |
| `DB_IDLE_TIMEOUT_MS` | suggest `30000` |
| `DB_STATEMENT_TIMEOUT_MS` | default `15000` (Neon ignores it; the `ALTER ROLE` in step 1 is what applies) |
| `LOG_REQUESTS` | optional, default on in production (method, route, status, ms, client IP; never bodies or cookies) |

Must **not** be set in production (the server refuses to start): `DB_SCHEMA`, `SEED`, `SEED_ON_START`, `ENABLE_SEED`, `DISABLE_RATE_LIMITS`. Leave `SMTP_HOST/USER/PASS` empty when `RESEND_API_KEY` is set.

## 3. Deploy order and checks

1. Migrations (section 1).
2. Render: Manual Deploy. Wait for **Live**. Then:
   - `https://<render host>/api/health` → `{"ok":true,"db":"ok"}`
   - `https://<render host>/api/health/ready` → `{"ok":true,"db":"ok","migrations":"current"}`
3. Vercel: deploys `main` automatically for the client (it only serves static files and proxies `/api`; no secrets). If the client did not change, nothing to do.
4. Through the public URL (Vercel): `https://<APP_URL>/api/health/ready` gives the same answer as above (the proxy works).
5. In the app:
   - [ ] Sign in as an admin: Dashboard opens on **Overview**, the **Operations** tab works, Invoices / Reports / Accounting / Salary open.
   - [ ] Sign in as a manager: no Invoices, Reports, Accounting or Salary in the menu; the dashboard has no money; `/invoices` redirects to the dashboard.
   - [ ] Sign in as an employee: punched in automatically; **Punch Out** asks for confirmation; signing out does **not** punch out.
   - [ ] Sign in as a client: Projects, **Invoices** (only their company's issued invoices; open one, Print / Save as PDF), Team.
   - [ ] Settings > Users: send yourself a reset link; the email arrives (check spam), has a plain and an HTML version, the link opens `APP_URL/set-password` and works once.
   - [ ] Employees: nobody who signs in shows "No login" (otherwise Link, or `npm run link-by-email`).
   - [ ] Employees: the "no working hours" reminder lists everyone created before working hours existed; set each person's shift (Edit > Shift Start / Shift End, IST). Until then their attendance uses the 06:00-05:59 working day.
6. Render logs: no `Mail send failed`, no `Automatic punch-in failed`, no 5xx bursts.

## 4. Vercel (client)

Project settings:

- **Root Directory:** `client`
- **Framework preset:** Vite. **Build command:** `npm run build`. **Output directory:** `dist`. **Install command:** default.
- **Environment variables:** none (the client has no configuration and no secrets).
- `client/vercel.json` rewrites `/api/:path*` to `https://hm-internal-api.onrender.com/api/:path*` and serves `index.html` for every other non-asset path; it also sets the security headers. If the Render service URL changes, change it there.
- **Domains:** the production domain (= `APP_URL`). Preview deployments use the same Render API: don't sign in to previews with real accounts.

## 5. DNS, TLS and TRUST_PROXY

- **App domain** (Vercel): add the domain in Vercel > Domains; at your DNS provider, a `CNAME` for the subdomain to the target Vercel shows (or `A` records for an apex). Vercel issues the TLS certificate. `APP_URL` must be exactly this origin.
- **Mail domain** (Resend): add the domain of `SMTP_FROM` in Resend and create every record it lists (SPF `TXT`, DKIM `CNAME`/`TXT`, the bounce `MX`); wait for **Verified**. Add a DMARC record (`_dmarc` `TXT`, start with `p=none`). In the domain's settings, **open and click tracking stay off**: the emails carry the real link only.
- **TRUST_PROXY = 2** (browser → Vercel → Render → app). Check it after each infrastructure change:
  1. Note your public IP (e.g. from your router or `curl https://ifconfig.me`).
  2. `curl -s https://<APP_URL>/api/health` and `curl -s -H "X-Forwarded-For: 203.0.113.9" https://<APP_URL>/api/health`.
  3. In Render's logs, both request lines must end with **your** IP. If they show a Vercel or Render address, the value is too low (everyone shares one rate-limit bucket); if the second shows `203.0.113.9`, it is too high (clients can choose their IP).

## 6. Rollback

- **Code:** Render > the service > Deploys > pick the previous good deploy > **Rollback**. Vercel > Deployments > previous > **Instant Rollback** (only if the client changed). Migrations are additive, so the previous code runs on the newer schema.
- **Never** edit or "down"-migrate an applied migration. A fix is a new numbered migration, released the same way.
- **Data:** within 6 hours, Neon **Restore** from history (NEON.md, "Backups and restore test": it keeps the old state as a branch). Older than that: restore the latest dump into a new branch, check it, then switch `DATABASE_URL`.

## 7. Backups

- Before every release with migrations, and weekly: `pg_dump -Fc --no-owner "<direct string>" -f hm-YYYYMMDD.dump` with a `pg_dump` 18 client; encrypt the file (`age` or `gpg`) before it leaves your machine; keep it outside Neon and Render.
- The one manual Neon snapshot on Free: take it right before step 1 (Console > Backup & Restore > Create snapshot).
- Restore test at least quarterly (NEON.md).

## 8. Free-tier caveats

- **Render free:** the service sleeps after about 15 minutes without traffic; the first request then takes up to a minute (Vercel may time out the proxied call once: retry). 750 instance hours a month. No Shell, no SMTP (ports 25/465/587 blocked: hence Resend). Local disk is wiped on every deploy (the app stores nothing there).
- **Neon free:** scales to zero after 5 minutes (wake-up adds latency to the first query), 0.25 CU, 100 CU-hours a month and 1 GB of storage per project, 6-hour history, 1 snapshot (NEON.md). When the monthly compute is used up the database is suspended until the next month.
- **Resend free:** 100 emails a day, 3,000 a month, one domain (check the current plan page). Invites and resets are well inside it; a failed send is a 502 and leaves nothing behind.
- **Vercel Hobby:** for non-commercial use under Vercel's terms; a company app should move to Pro. Bandwidth and function limits are not an issue (static files and a rewrite).
- **Sessions** live in Postgres (`sessions` table): a Render restart signs nobody out. Every session ends 12 hours after sign-in regardless.

## 9. One-off maintenance scripts (your machine, production variables in the window)

- `npm run check-accounts -- --plan "name=role,..."` (read-only): every login with role, state, linked employee and last login, plus flags (role differs from the plan, client without a company, employee login without an employee record, employees without a login).
- `npm run link-by-email` (dry run) and `npm run link-by-email -- --apply`: links employees to the staff logins with the same email; prints every pair and why any is skipped.
- `npm run create-admin -w server -- --email <address>`: a new admin (hidden password prompt).
