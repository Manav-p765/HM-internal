# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Monks Internal Management: internal app for Hybrid Monks LLP (accounting, employees, invoices, salaries, attendance, reports). npm workspaces: `client/` (React 19 + Vite + Tailwind 4) and `server/` (Express 5 + TypeScript, plain `pg`, plain SQL migrations). One Node process serves `/api` and, in production, the built client.

## Commands (run from the repo root)

```sh
npm run dev                  # server :4000 (tsx watch) + client :3000 (Vite, proxies /api → :4000)
npm run lint                 # tsc --noEmit for both workspaces (there is no ESLint/Prettier)
npm run lint -w client       # type-check one workspace
npm run lint -w server
npm test                     # server vitest + supertest suite (needs Postgres running)
npm test -w server -- test/auth.test.ts   # single file
npm test -w server -- -t "login"          # tests whose name matches
npm run db:migrate           # apply pending server/db/migrations/*.sql
npm run db:seed              # load server/db/seed.dev.sql (refuses if users exist)
npm run db:seed -- --reset   # wipe app data and reseed
npm run build                # client/dist + server/dist
npm run create-admin -w server -- --email you@example.com   # create an admin (hidden password prompt; how the first production admin is made)
```

## Rules

- Never edit an applied migration; always add a new numbered one (a hook blocks edits to existing files in `server/db/migrations/`).
- Money is `NUMERIC(14,2)` in Postgres and travels as a string, never a JS float.
- Roles are enforced on the server (`requireAuth` + `requireRole` on every route); UI checks are cosmetic only.
- No passwords, temporary passwords or tokens in logs, API responses or audit metadata. The only exception is the dev mail printout in `server/src/services/mail.ts`.
- Do not add new npm libraries without asking first.
- Don't edit `.env` or `package-lock.json` (also blocked by a hook).

## Local environment

- Postgres runs in Docker on **127.0.0.1:5440** (use `127.0.0.1`, not `localhost`):
  ```sh
  docker run -d --name hm-internal-pg -e POSTGRES_USER=hm -e POSTGRES_PASSWORD=hm_dev_pw \
    -e POSTGRES_DB=hm_internal -p 127.0.0.1:5440:5432 postgres:18
  # DATABASE_URL=postgres://hm:hm_dev_pw@127.0.0.1:5440/hm_internal
  ```
- `.env` lives at the repo root (loaded by `server/src/config.ts`, validated with zod; the server exits on invalid config). It holds the real `SESSION_SECRET` and `DATABASE_URL` — don't edit it.
- Seed logins (password `devpass123`): `admin@example.test`, `manager@example.test`, `employee1@example.test`, `employee2@example.test`. EMP-004 is an employee without a login, for testing "Add user".
- With `SMTP_HOST` empty (dev), every email — temporary passwords, reset links — is **printed to the server console** instead of sent. In tests, mail goes to `testOutbox` in `server/src/services/mail.ts`.

## Architecture

### Migration in progress: localStorage → Express + Postgres

The app started as a client-only prototype storing everything in localStorage. Auth and user management are now server-side; the other domains (employees, invoices, transactions, salaries, salary slips, attendance, leaves, settings, activity/audit logs) still live in `client/src/services/storage.ts` (`StorageService`) and are wired through `client/src/context/AppContext.tsx`. Each phase moves one domain to the server. The users/auth implementation is the reference pattern:

- **Server route**: `server/src/routes/users.ts` — `Router()` with `requireAuth` + `requireRole(...)`, zod schemas validated via `parseBody()`, ids parsed with `z.uuid()` (invalid → 404), `HttpError(status, message, CODE)` for failures, `withTransaction()` for multi-statement writes with `FOR UPDATE` locking, `audit(req, {...})` after successful mutations. Mounted in `server/src/app.ts` under the `api` router.
- **Audit actions** are a closed union type in `server/src/services/audit.ts`; add new action strings there. Never put passwords or tokens in metadata.
- **Client API module**: `client/src/api/users.ts` — thin typed wrappers over `api()` in `client/src/api/client.ts`, which throws `ApiError` and triggers the session handlers on 401 `UNAUTHENTICATED` / 403 `PASSWORD_CHANGE_REQUIRED`.
- **Tests**: `server/test/auth.test.ts` — `createUser(email, role)` + `signIn()` (a `request.agent(app)` keeping the session cookie), `TRUNCATE ... CASCADE` in `beforeEach`, assertions on `audit_logs` rows.

### Auth and sessions (`server/src/middleware/auth.ts`, `server/src/session.ts`)

- Cookie sessions stored in Postgres (`sessions` table via connect-pg-simple). The user is reloaded from the DB on every request, so disabling a user or changing a role takes effect immediately; `deleteUserSessions()` signs a user out everywhere.
- `requireSession` = signed in. `requireAuth` = `requireSession` + the forced-password-change gate. Only `/auth/me`, `/auth/logout`, `/auth/change-password` use `requireSession` directly; **every other route must use `requireAuth`** and a `requireRole`.
- Roles: `admin`, `manager`, `employee`, enforced only by the server.
- `checkOrigin` (`server/src/middleware/security.ts`) rejects mutating requests from foreign origins (CSRF defence alongside SameSite=Lax). Rate limiters live there too and are skipped in tests.
- Invite-only accounts: admins create users, the server emails a temporary password, `must_change_password` forces a change at first sign-in.

### Database

- `server/src/db.ts`: `query()` and `withTransaction()`; all SQL is hand-written and must be parameterised (`$1`, `$2`…). `NUMERIC` comes back as a string (intended, for money); `DATE` comes back as `'YYYY-MM-DD'`.
- `server/src/migrations.ts` applies `server/db/migrations/NNN_name.sql` in filename order, each in a transaction, recording filenames in `schema_migrations`. **An applied file is never re-run, so never edit an existing migration — add a new numbered one.**
- Schema conventions (see header of `001_init.sql`): uuid PKs (`gen_random_uuid()`), `citext` emails, money `numeric(14,2)`, text status columns with `CHECK (... IN (...))`, `created_at`/`updated_at timestamptz` on every app table with a `set_updated_at()` trigger. `audit_logs` is append-only (no `updated_at`).
- Snake_case columns are aliased to camelCase in SELECTs (`must_change_password AS "mustChangePassword"`).

### Tests

Tests use the same `DATABASE_URL` but a separate Postgres schema: `server/vitest.config.ts` sets `DB_SCHEMA=hm_test`; `test/global-setup.ts` drops and recreates that schema and runs all migrations once per run. Dev data in `public` is untouched. Files run serially (`fileParallelism: false`).
