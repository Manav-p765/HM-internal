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
- **Every route declares its roles** (deny by default): routes are added only through `createRouter()` from `server/src/middleware/access.ts` — `router.get(path, access, ...handlers)` where `access` is `'public'`, `'session'` (only `/auth/me`, `/auth/logout`, `/auth/change-password`) or a role list such as `['admin', 'manager']` or `STAFF` — and routers are mounted with `mountRouter()`. `server/test/route-matrix.test.ts` walks every registered route and fails if one bypasses this, if a client session can reach anything outside its allowlist, or if a non-public route answers an anonymous caller. UI checks are cosmetic only.
- **Out-of-scope ids are 404, never 403:** when a record exists but belongs to someone else (another employee's task, another company's project), answer exactly like a missing id so nothing leaks. 403 is only for "your role can't do this at all".
- **Client portal API** lives in `server/src/routes/portal.ts` under `/api/portal`, every route `['client']`, scoped by `clientScope(req)`; clients only see `client_visible` tasks of their company's non-archived projects and only `client_feedback` comments (filtered in SQL). Portal responses select an explicit column list with no internal fields; `server/test/portal.test.ts` asserts on the raw JSON text that internal notes never appear.
- **Client scoping:** a `client` user sees only their own company. Client-scoped queries take the company from `clientScope(req)` (= `req.user.clientId`), never from the body, query string or URL. Clients never see finance (invoices, salary, ledger, reports), employee records or other clients. Adding a client-visible route means adding it to the allowlist in `route-matrix.test.ts` on purpose.
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

The app started as a client-only prototype storing everything in localStorage. Auth, users, **employees**, clients, projects/tasks, **attendance, presence and leaves** are now server-side; the other domains (invoices, transactions, salaries, salary slips, settings, activity/audit logs) still live in `client/src/services/storage.ts` (`StorageService`) and are wired through `client/src/context/AppContext.tsx`. Each phase moves one domain to the server. **Employees is the reference pattern** to copy:

- **Server route**: `server/src/routes/employees.ts` — `createRouter()` with an explicit access list on every route, zod schemas validated via `parseBody()` (unknown keys are stripped; use `.strict()` where extra fields must be rejected), ids parsed with `z.uuid()` (invalid → 404), `HttpError(status, message, CODE)` for failures, `withTransaction()` for multi-statement writes with `FOR UPDATE` locking, `audit(req, {...})` after successful mutations (field names, never values like salaries). Unique violations (`23505`) become 409s. Static paths (`/directory`, `/me`) are declared before `/:id`. Mounted in `server/src/app.ts`.
- **Role-scoped fields**: fields only admins may see (salary: `monthlySalary`, `paymentMethod`) are deleted from the response object for other roles, not nulled (`forViewer()` in `routes/employees.ts`).
- **Never deleted**: records are deactivated/reactivated; there is no DELETE route. Codes like `EMP-001` are assigned by the server (max+1 under `pg_advisory_xact_lock`).
- **API shapes are the client types**: `client/src/types/index.ts` mirrors the JSON (camelCase, lowercase status values like `'on_leave'` with a `*_LABEL` map for display, money as decimal strings). Don't map to old prototype shapes.
- **Audit actions** are a closed union type in `server/src/services/audit.ts`; add new action strings there. Never put passwords or tokens in metadata.
- **Client API module**: `client/src/api/employees.ts` — thin typed wrappers over `api()` in `client/src/api/client.ts`, which throws `ApiError` (with per-field `details` for 400s) and triggers the session handlers on 401 `UNAUTHENTICATED` / 403 `PASSWORD_CHANGE_REQUIRED`.
- **Page data**: each page fetches its own data with `useApiData(load, deps)` (`client/src/api/useApiData.ts`) and renders loading / `LoadError` / `EmptyState`; nothing server-backed goes into `AppContext`. Forms show server validation errors with `common/FormField`.
- **Tests**: `server/test/employees.test.ts` — a role matrix (admin/manager/employee/anonymous) per route, then behaviour tests; `createUser(email, role, employeeId)` + `signIn()` (a `request.agent(app)`), `TRUNCATE ... CASCADE` in `beforeEach`, assertions on `audit_logs` rows.

### Client routing (`client/src/App.tsx`, `client/src/routes/guards.tsx`)

- react-router v7 (`import from 'react-router'`). Pages are `React.lazy` chunks rendered inside `MainLayout`'s `<Outlet/>`.
- `RequireAuth` (→ `/login` with `state.from`, → `/change-password` while `mustChangePassword`), `RequireRole roles={[...]}` (→ `/dashboard` + toast), `RedirectIfSignedIn` for `/login` and `/forgot-password`.
- Detail views are routes that open a modal over the list (`/employees/:id`, `/invoices/:id`); the modal loads its own record so deep links work.
- Sidebar items are role-filtered `NavLink`s in `components/layout/Sidebar.tsx` (cosmetic; the server is the guard).
- **Two shells:** staff use `MainLayout` (wrapped in `RequireStaff` + `AppProvider`); `client` users use `/portal` (`ClientPortalLayout`, wrapped in `RequireClient`, no `AppProvider`, so no staff/localStorage data is ever loaded for them). A client opening any staff URL lands on `/portal`; staff opening `/portal` land on `/dashboard`. Login return paths are only honoured within the user's own shell (`safeReturnPath` in `routes/guards.tsx`).
- Work routes: `/projects(/:id)` and `/tasks(/:id)` (admin, manager), `/my/tasks(/:id)` and `/my/projects(/:id)` (employee; same `TasksView`/`ProjectsView` components in "mine" mode), `/portal`, `/portal/projects(/:id)`, `/portal/team` (client). Attendance and leaves: `/attendance`, `/leaves` (admin, manager), `/my/attendance`, `/my/leaves` (employee). Task status changes go through `components/work/TaskStatusControl.tsx`, which mirrors the server rules (`EMPLOYEE_TASK_TRANSITIONS` in `types/work.ts`). Project/task/portal types live in `client/src/types/work.ts`.
- Creating logins: `components/users/AddUserModal.tsx` (shared by Settings > Users and the client detail panel; managers only get the client role).
- `currentUser` (AppContext) comes from the session (`/api/auth/me`, which includes the linked employee's name, designation, department, avatarUrl); `currentUser.employeeId` is the employee uuid.

### Auth and sessions (`server/src/middleware/auth.ts`, `server/src/session.ts`)

- Cookie sessions stored in Postgres (`sessions` table via connect-pg-simple). The user is reloaded from the DB on every request, so disabling a user or changing a role takes effect immediately; `deleteUserSessions()` signs a user out everywhere.
- `requireSession` = signed in. `requireAuth` = `requireSession` + the forced-password-change gate. Routes don't use these directly: `createRouter()` applies them from the declared access (`'session'` → `requireSession`; a role list → `requireAuth` + `requireRole`).
- Roles: `admin`, `manager`, `employee`, `client` (portal users of a client company, `users.client_id`), enforced only by the server. A client user of an inactive company is treated as signed out (`loadSessionUser`) and can't log in. Managers may create and manage client users only.
- `checkOrigin` (`server/src/middleware/security.ts`) rejects mutating requests from foreign origins (CSRF defence alongside SameSite=Lax). Rate limiters live there too and are skipped in tests.
- Invite-only accounts: admins create users, the server emails a temporary password, `must_change_password` forces a change at first sign-in.

### Database

- Shared route helpers: `server/src/routes/shared.ts` (`optionalText`, `isoDate`, `pageQuery`, `likePattern`, `TODAY_SQL`). "Overdue" is always derived (`status <> 'completed' AND deadline < TODAY_SQL`, Asia/Kolkata), never stored; names (project, assignee, client) are joined, never copied onto rows.
- **Time and "today":** attendance, presence and leave code reads time only through `server/src/services/clock.ts` (`now()`, `istDate()`, `todayIst()`, `countWeekdays()`), never `Date.now()` directly, Postgres `now()` for business timestamps, or the browser clock. Tests freeze it with `setClock()` / `resetClock()`. The client shows times with `formatTimeIst` and takes "today" from API responses (`date`, `today`, `serverTime`).
- **Availability** (`on_leave | online | available | not_in_today`) lives only in `server/src/services/availability.ts` (`deriveAvailability` rules + `availabilityFor(ids)`); every screen that shows a status asks it, nothing stores it. Online = punched in today, not punched out, heartbeat within 5 min; half-day leave does not count as on leave.
- **Attendance:** one `attendance_records` row per employee per IST date. Employee-role users with an active linked employee are punched in automatically (`autoPunchIn` in `services/attendance.ts`) at login and on the first `/auth/me` or heartbeat of a new IST day (once per session per day via `req.session.punchCheckedOn`); it never fails the request. Managers/admins are not auto-punched. `updated_by IS NOT NULL` means "corrected by an admin/manager"; corrections are audited with before/after values, and nobody corrects their own record (400 `CANNOT_CORRECT_OWN`). Heartbeats (`POST /api/presence/heartbeat`, `usePresence` in the staff layout) write `employees.last_seen_at` at most every 30 s, are not audited, and don't bump `employees.updated_at`.
- **Leaves:** `total_days` = weekdays only (half day 0.5), computed by the server; no overlap with the same employee's pending/approved requests; only pending requests can be edited/cancelled (owner) or reviewed (admin/manager, never their own: 400 `CANNOT_REVIEW_OWN`). Reasons are only returned to the owner, admins and managers; audit metadata never contains them.

- `server/src/db.ts`: `query()` and `withTransaction()`; all SQL is hand-written and must be parameterised (`$1`, `$2`…). `NUMERIC` comes back as a string (intended, for money); `DATE` comes back as `'YYYY-MM-DD'`.
- `server/src/migrations.ts` applies `server/db/migrations/NNN_name.sql` in filename order, each in a transaction, recording filenames in `schema_migrations`. **An applied file is never re-run, so never edit an existing migration — add a new numbered one.**
- Schema conventions (see header of `001_init.sql`): uuid PKs (`gen_random_uuid()`), `citext` emails, money `numeric(14,2)`, text status columns with `CHECK (... IN (...))`, `created_at`/`updated_at timestamptz` on every app table with a `set_updated_at()` trigger. `audit_logs` is append-only (no `updated_at`).
- Snake_case columns are aliased to camelCase in SELECTs (`must_change_password AS "mustChangePassword"`).

### Tests

- Fixture helpers for multi-role scenarios: `server/test/fixtures.ts` (`resetAll`, `employee`, `company`, `user`, `signIn`, `project`, `task`, `comment`). Time-dependent tests call `setClock()` in `beforeEach` and `resetClock()` in `afterEach`.

Tests use the same `DATABASE_URL` but a separate Postgres schema: `server/vitest.config.ts` sets `DB_SCHEMA=hm_test`; `test/global-setup.ts` drops and recreates that schema and runs all migrations once per run. Dev data in `public` is untouched. Files run serially (`fileParallelism: false`).
