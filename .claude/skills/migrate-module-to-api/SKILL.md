---
name: migrate-module-to-api
description: Move one localStorage domain (e.g. invoices) to Express + Postgres, copying the employees module pattern
disable-model-invocation: true
---

# Migrate a module from localStorage to the API

Argument: the domain to move (e.g. `invoices`, `transactions`, `salaries`, `attendance`, `settings`). If none was given, ask.

**The employees module is the reference.** Read these first and copy their shape rather than inventing a new one:

| Layer | Reference file |
|---|---|
| Server route | `server/src/routes/employees.ts` |
| Auth / roles | `server/src/middleware/access.ts` (`createRouter`, `mountRouter`, `STAFF`, `clientScope`) and `server/src/middleware/auth.ts` (`deleteUserSessions`) |
| Errors / validation | `server/src/middleware/errors.ts` (`HttpError`, `parseBody`) |
| Audit | `server/src/services/audit.ts` (`audit()`, the `AuditAction` union) |
| Tests | `server/test/employees.test.ts` (role matrix + behaviour) |
| Client API module | `client/src/api/employees.ts` over `client/src/api/client.ts` |
| Page data hook | `client/src/api/useApiData.ts` |
| Pages / modals | `client/src/components/employees/EmployeesView.tsx`, `EmployeeModal.tsx`, `EmployeeDetailModal.tsx` |
| Removal from local storage | commit `19424ee` ("Move employees to the API on the client…"): what left `AppContext.tsx`, `services/storage.ts`, `types/index.ts` |

## 1. Understand the current behaviour

- Find every `StorageService` method for the domain in `client/src/services/storage.ts`, every caller in `client/src/context/AppContext.tsx` and `client/src/components/`, and the seed array it reads from.
- List the business rules hidden in those methods (derived statuses, number generation, linked records such as invoice payments creating income transactions, rounding). They move to the server; none are dropped silently.
- Compare the table in `server/db/migrations/` with what the UI actually uses. Only real gaps justify a migration.
- Decide the role matrix per route (who may list / read / create / update / deactivate) and which fields each role may see. If it isn't obvious from the existing UI and earlier decisions, ask before coding.

## 2. Migration (only when needed)

Only if a column or table is genuinely missing. Use `/create-migration`: next number, **never edit an applied migration** (a hook blocks it). Employees needed none.

## 3. Server route: `server/src/routes/<module>.ts`

- **Every route declares its roles.** Build the router with `createRouter()` and give each route its access: `router.get('/', ['admin', 'manager'], handler)` (or `STAFF` for any staff). Deny by default: there is no way to add a route without one, and `server/test/route-matrix.test.ts` fails if a route bypasses it. Mount with `mountRouter(api, '/<module>', router)` in `app.ts`. `'session'` access is only for `/auth/me`, `/auth/logout`, `/auth/change-password`.
- If client-role scoping exists (`req.user.clientId`), every route must also state what a client may see, and the route-matrix test must stay green.
- Data owned by the caller (`/me`-style routes) is selected by `req.user.employeeId` / `req.user.clientId`, never by an id from the body or URL. A record outside the caller's scope is a **404 identical to a missing id** (see `routes/tasks.ts` assignee scope and `routes/portal.ts`), never a 403.
- Client-facing data goes through `/api/portal` (`routes/portal.ts`) with an explicit column list; never reuse a staff SELECT for clients. Use `routes/shared.ts` helpers (`isoDate`, `pageQuery`, `likePattern`, `TODAY_SQL`) and derive values like "overdue" in SQL instead of storing them.
- **Anything date/time based** (today, deadlines, durations, presence) reads the clock through `services/clock.ts` (`now()`, `istDate()`, `todayIst()`), passes the instant to SQL as a parameter, and returns "today" in the response for the UI. Never trust the browser clock; tests move time with `setClock()`. Derived statuses with several inputs get one pure function (like `deriveAvailability` in `services/availability.ts`) with its own unit test.
- A client-visible view of staff data (like `GET /api/portal/team`) returns an explicit object built field by field (no ids unless needed), and its test asserts the exact JSON keys.
- Validate every body with a zod schema through `parseBody(schema, req.body)` (trim strings, bound lengths, `z.enum` for statuses, dates as `YYYY-MM-DD`). Query strings: `schema.safeParse(req.query)`. Ids: `z.uuid()`, invalid → 404. Use `.strict()` where extra fields must be rejected (as `PATCH /employees/me` does).
- **Parameterised SQL only** (`$1`, `$2`…). Dynamic `SET` lists or sort columns come from a fixed whitelist (like the `COLUMN` map in `employees.ts`), never from request text.
- Money: accept a number or numeric string, validate to 2 decimals, pass to Postgres as a string, return the `NUMERIC` string as-is. Never a JS float in SQL.
- **Fields hidden per role are removed on the server**, in the query or the response object (`forViewer()` deletes `monthlySalary`/`paymentMethod` for non-admins, and summary totals too). Never rely on the UI to hide them. Test that the keys are absent.
- `withTransaction()` for multi-statement writes; `FOR UPDATE` where a check-then-write could race. Server-assigned codes (like `EMP-001`) use `pg_advisory_xact_lock` + max+1.
- Errors: `HttpError(status, 'Human message', 'UPPER_SNAKE_CODE')`. 404 `NOT_FOUND`, 409 for conflicts (map unique violations `23505` to 409), 400 `VALIDATION_ERROR`.
- Responses wrap the payload (`{ invoices, total, limit, offset }`, `{ invoice }`); 201 on create. Lists take `search`, filters, `limit` (default 50, max 200) and `offset`.
- **Soft delete where data has history:** `POST /:id/deactivate` and `/:id/reactivate`, no `DELETE` route. Deactivation also handles linked logins (disable + `deleteUserSessions`) where relevant.
- **`audit()` after every mutation**: `await audit(req, { action: '<module>.<verb>', entityType, entityId, metadata })`. Add the action strings to the `AuditAction` union. Metadata holds changed **field names**, never values for secrets or money (no salaries, passwords, tokens).
- Mount it in `server/src/app.ts` with `mountRouter()` next to the existing routers, and keep `npm test` green (the route matrix covers it automatically).

## 4. Tests: `server/test/<module>.test.ts` (run in the `hm_test` schema)

Copy the structure of `employees.test.ts` (and `projects-tasks.test.ts` / `portal.test.ts` with the helpers in `server/test/fixtures.ts` for multi-role scenarios):
- `beforeEach`: `TRUNCATE ... CASCADE` the module's tables plus `audit_logs, auth_tokens, sessions, users, employees`; create one user per role; sign each in with `request.agent(app)`. `afterAll`: `pool.end()`.
- **Role matrix for every route**: expected status for admin / manager / employee / (client, if the role exists) / anonymous.
- Fields hidden per role are absent (`not.toHaveProperty`), including in lists and summaries.
- Validation errors: one case per rule, asserting `400 VALIDATION_ERROR` and the field path in `details`. Unknown/invalid ids → 404.
- Business rules, deactivate/reactivate side effects (logins disabled, sessions killed), uniqueness conflicts (409), and the `audit_logs` row (with no sensitive values) for each mutation.

## 5. Client

- `client/src/types/index.ts`: types mirror the API JSON exactly (camelCase, lowercase status values with a `*_LABEL` map for display, money as strings, admin-only fields optional). Don't map to the old prototype shapes.
- `client/src/api/<module>.ts`: a `<module>Api` object of one-line typed wrappers over `api<T>()`, unwrapping the envelope, like `employeesApi`.
- Each page fetches its own data with `useApiData(load, deps)` and renders the three states: loading text, `LoadError` (with retry), `EmptyState`. After a mutation, `showToast` and `reload()` (or `setData` with the server response). Forms show server field errors with `common/FormField` (see `EmployeeModal`). Detail views are routes (`/<module>/:id`) whose modal loads its own record.
- **Remove the module from local state completely:** its fields and functions in `AppContext.tsx`, its methods and seed array in `services/storage.ts`, and its localStorage key. Either delete the key or bump it (`_v1` → `_v2`) and add the old key to the cleanup list in `client/src/context/AuthContext.tsx`. Other local modules that referenced the removed data get the API data passed in instead (as salary generation now receives the API employee list).
- If `server/db/seed.dev.sql` has rows for the domain, keep them realistic and clearly fake. Date-based seed rows are generated relative to the IST date at seed time (see the attendance/leave inserts) and the tables go into the `--reset` TRUNCATE list in `scripts/seed.ts`.

## 6. Finish

```sh
npm run db:migrate
npm test
npm run lint
npm run build
```

Then a short manual check of the page in the browser (list, search, create, edit, deactivate/reactivate, and one role that should be refused), and run the `security-reviewer` agent on the changed files. Summarise: endpoints and their role matrix, fields hidden per role, audit actions, and anything deliberately left in localStorage.
