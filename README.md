# Monks Internal Management

Internal app for Hybrid Monks LLP: accounting, employees, invoices, salaries and reports.
Served from a single Node process at internal.hybridmonks.com.

- `client/` – React + Vite + TypeScript (Tailwind)
- `server/` – Node + Express + TypeScript, plain `pg`, plain SQL migrations in `server/db/migrations/`

## Requirements

- Node 20+ and npm 10+
- PostgreSQL 15+ (uses the `citext` extension and `gen_random_uuid()`)

## Setup

```sh
npm install
cp .env.example .env          # then fill in DATABASE_URL and SESSION_SECRET
createdb hm_internal          # or create it any other way
npm run db:migrate            # applies server/db/migrations/*.sql in order
npm run db:seed               # dev-only fake data (refuses to run with NODE_ENV=production)
npm run dev                   # server on :4000, client on :3000 (proxies /api to :4000)
```

No local Postgres? A throwaway container works (use `127.0.0.1`, not `localhost`, in the URL):

```sh
docker run -d --name hm-internal-pg -e POSTGRES_USER=hm -e POSTGRES_PASSWORD=hm_dev_pw \
  -e POSTGRES_DB=hm_internal -p 127.0.0.1:5440:5432 postgres:18
# DATABASE_URL=postgres://hm:hm_dev_pw@127.0.0.1:5440/hm_internal
```

`npm run db:seed` refuses to run on a database that already has users; use `npm run db:seed -- --reset` to wipe app data and reseed.

Seed logins (dev only, all share the password `devpass123`):
`admin@example.test`, `manager@example.test`, `employee1@example.test`, `employee2@example.test`.
The seed also has one employee without a login (EMP-004) for trying "Add user".

## Accounts and sign-in

- Invite-only: there is no signup. An admin adds a user in **Settings > Users**; the server generates a
  temporary password and emails it. The user must choose a new password at first sign-in.
- In development, with `SMTP_HOST` empty, emails (including the temporary password and reset links)
  are printed to the server console instead of being sent.
- Forgot password sends a one-time link that expires after 1 hour.
- Roles (`admin`, `manager`, `employee`) are enforced by the server. `/api/users` is admin only.
- The first admin in production is created from the terminal (the password is typed at a hidden prompt):

  ```sh
  NODE_ENV=production npm run create-admin -w server -- --email you@hybridmonks.com
  ```

## Tests

```sh
npm test          # server auth tests (vitest + supertest)
```

The tests use the database in `DATABASE_URL` but run inside their own Postgres schema (`hm_test`),
which is dropped and re-created on every run, so dev data is not touched. Postgres must be running.

## Scripts (run from the repo root)

| Script | What it does |
|---|---|
| `npm run dev` | Runs server (tsx watch) and client (Vite) together |
| `npm run build` | Builds `client/dist` and `server/dist` |
| `npm start` | Runs the built server; in production it also serves `client/dist` |
| `npm run lint` | Type-checks client and server |
| `npm run db:migrate` | Applies pending SQL migrations (tracked in `schema_migrations`) |
| `npm run db:seed` | Loads `server/db/seed.dev.sql` |
| `npm test` | Runs the server test suite |
| `npm run create-admin -w server -- --email …` | Creates an admin account from the terminal |

## Production

```sh
npm ci && npm run build
NODE_ENV=production npm run db:migrate
NODE_ENV=production npm run create-admin -w server -- --email you@hybridmonks.com   # first deploy only
NODE_ENV=production npm start
```

The server serves the API under `/api` and the built client for every other path.
Production needs `APP_URL`, a 32+ character `SESSION_SECRET`, and `SMTP_HOST` + `SMTP_FROM`; the server
exits at startup if any of them is missing. It expects to sit behind a TLS-terminating reverse proxy.
