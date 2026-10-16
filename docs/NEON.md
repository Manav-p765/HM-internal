# Neon (production database)

No secrets in this file. Connection strings live only in the Neon Console, in Render's environment settings, and in a PowerShell session for as long as a command runs.

## Project

| | |
| --- | --- |
| Project | `hm-internal` (id `soft-poetry-35293513`) |
| Region | AWS Asia Pacific 1, Singapore (`aws-ap-southeast-1`) |
| Postgres | 18 (server reported 18.6) |
| Database | `hm_internal` |
| Role | `hm_app` (owner of `hm_internal`, member of `neon_superuser`, not a Postgres superuser) |
| Plan | Free |
| Compute | 0.25 CU fixed (min = max), scale to zero after 5 min (plan default, cannot be changed on Free) |
| Created | 2026-10-16 |

## Branches

- `main`: default, production. Created empty. Migrations are applied to it by hand (steps below), never by a test or a script.
- Child branches are for one-off checks only (a migration rehearsal, a restore test) and are deleted afterwards. The Free plan allows 10 branches per project.
- `scratch-migration-test` (the 2026-10-16 rehearsal, with extra databases `migrate_test` and `pooled_test`) is still to be deleted in the Console: Branches > scratch-migration-test > Delete.

## Free plan limits (from Neon's docs, 2026-10-16)

| Limit | Free plan |
| --- | --- |
| Storage | 1 GB per project (20 GB across all projects). Above it, inserts/updates/deletes fail until space is freed; data is not deleted |
| Compute | 100 CU-hours per project per month (about 400 h at 0.25 CU). When used up, the compute is suspended until the next month |
| Scale to zero | After 5 min idle, always on, cannot be disabled. Wake-up "typically a few hundred milliseconds" (another page says "within a few seconds") |
| Instant restore (PITR) | 6-hour history window, capped at 1 GB of change history. The project was created with `history_retention_seconds = 21600` |
| Snapshots | 1 manual snapshot; no scheduled backups |
| Network transfer | 5 GB per project per month |
| Connections | `max_connections` 104 at 0.25 CU per the docs (7 reserved); this compute reported 112. The pooler accepts up to 10,000 clients |
| Pooled endpoint | Available (PgBouncer, transaction mode) on every compute, host with `-pooler` |
| Deleted project | Recoverable for 7 days (CLI/API only), then permanent |

Not verified:
- Whether inactive Free projects are suspended or deleted after a period of no use. The docs are silent; only branch archiving is described (child branches older than 14 days and unused for 24 h are archived and unarchive on first access).
- The actual wake-up latency from Render to Singapore (not measured, see below).

## Migration rehearsal (2026-10-16)

On a throwaway child branch `scratch-migration-test` of `main`:

- `npm run db:migrate` (direct endpoint, empty database): `Applied 8 migration(s).` A second run printed `No pending migrations.` The schema checks below were done on a copy applied through the Neon SQL tool; both copies came from the same files.
- Connecting from the office machine took 3 to 5 s for TCP alone, so the default `DB_CONNECTION_TIMEOUT_MS` of 5000 failed with "Connection terminated due to connection timeout". With 30000, every run worked.
- Extensions: `citext 1.8` (created by 001), `plpgsql 1.0` (built in). No other extension is needed.
- Statements that need an extension or a privilege, and whether Neon allowed them:
  - `CREATE EXTENSION IF NOT EXISTS citext` (001): allowed for `hm_app`.
  - `gen_random_uuid()` defaults (all files): core Postgres 13+, no extension, works.
  - `CREATE FUNCTION ... LANGUAGE plpgsql` (001): allowed.
  - `CREATE TRIGGER` on own tables (001, 003, 004, 005, 008): allowed.
  - `pg_advisory_lock` / `pg_advisory_xact_lock`: allowed.
- Checked on Neon:
  - 20 tables, including `schema_migrations` and `sessions` (`sid varchar`, `sess json`, `expire timestamp`).
  - 64 CHECK constraints; inserting `status = 'bogus'` was rejected.
  - Generated columns `invoice_items.line_total` and `salaries.net_payable` exist; base 50000.00 with adjustments -1500.25 gave 48499.75.
  - 14 `set_updated_at` triggers. An update bumped `updated_at`; a heartbeat-only update (`last_seen_at`) left it alone.
  - citext: a second employee with the same email in different case was rejected by the unique index; the transaction rolled back.
- Invoice numbering: 10 drafts were sent by 10 separate transactions using the same `SELECT ... FOR UPDATE` on `company_settings` as `takeInvoiceNumber`. Result: HM-0001 to HM-0010, 10 distinct, next = 11. The tool may have run them one after another, so this shows correctness, not contention. The real concurrency test is `server/test/invoices.test.ts`, which was not run against Neon.
- Session store: a `sessions` row upsert and read-back (the connect-pg-simple pattern) worked.
- `main` was checked afterwards: 0 user tables.

## Direct or pooled

Recommendation: **use the direct (non-pooled) connection string for everything**, including the app on Render.

Measured on the scratch branch (2026-10-16), with the app's own pool and connect-pg-simple store:

| Check | Direct | Pooled |
| --- | --- | --- |
| `npm run db:migrate` on an empty database | Applied 8 | Applied 8 |
| `SET` visible in the next statement | yes | yes |
| Session `pg_advisory_lock` held by the same backend, then released, none left over | yes | yes |
| connect-pg-simple `set` / `get` / `destroy` | yes | yes |
| Named (protocol-level) prepared statement reused | yes | yes |
| `statement_timeout` from `DB_STATEMENT_TIMEOUT_MS` (15000) | **0 (not applied)** | **0 (not applied)** |

Why direct anyway:
- The pooled successes ran with a single idle client. In that case PgBouncer happens to hand back the same server connection. Neon's docs state that session-level advisory locks and `SET` are not supported in transaction mode; under load, the migration lock could be taken and released on different backends. Neon also says migrations and `pg_dump` must use a direct connection.
- The app needs no pooler. It is one Render instance with `DB_POOL_MAX` 10 against about 97 usable connections. Its other locks are transaction-scoped (`pg_advisory_xact_lock`, `FOR UPDATE`), and it uses no `LISTEN`, temp tables or SQL `PREPARE`.

Finding: `statement_timeout` is dropped on Neon. The app sends it as a startup parameter (`server/src/db.ts`). The same probe against local Docker Postgres showed `15s`, but on Neon both endpoints showed `0`, so runaway queries are not cancelled in production. Options, not yet applied:
- Once, on `main`: `ALTER ROLE hm_app SET statement_timeout = '15s';`. Migrations still set it to 0 for their own connection.
- Or change the code to run `SET statement_timeout` on each new pool connection.

Not done: the server test suite against Neon, a load test through the pooler, and a measured wake-up latency after scale to zero.

## Driver notes

- `DATABASE_SSL` is not read by the app. TLS comes from `sslmode=require` in Neon's connection string. `pg` 8.23 treats `require` as `verify-full` and prints a "SECURITY WARNING ... aliases for 'verify-full'" line. That is harmless; editing the URL to `sslmode=verify-full` silences it.
- `channel_binding=require` in Neon's string is ignored by `pg` (it only uses the `enableChannelBinding` client option). Authentication is still SCRAM-SHA-256 over TLS.

## First production setup (run by the owner, once)

In a new PowerShell window at the repo root. The variables exist only in this window.

1. In the Neon Console, open project `hm-internal`, click **Connect**, choose branch `main`, database `hm_internal`, role `hm_app`, turn **Connection pooling off**, and copy the connection string.
2. Set the variables for this session:
   ```powershell
   $env:DATABASE_URL = "<paste>"
   $env:DATABASE_SSL = "require"
   ```
3. Apply the migrations (expect `Applied 8 migration(s)`; a second run prints `No pending migrations`). The longer connect timeout is needed from the office line:
   ```powershell
   $env:DB_CONNECTION_TIMEOUT_MS = "30000"
   npm run db:migrate
   ```
4. Create the first admin (the password prompt is hidden):
   ```powershell
   npm run create-admin -w server -- --email <your email>
   ```
5. Close the window.

The root `.env` is loaded as well, but it never overrides a variable that is already set, so `DATABASE_URL` above wins. Do not put the Neon string in `.env`.

## Render environment variables (names only)

- `DATABASE_URL`: the direct string from step 1
- `DATABASE_SSL` = `require` (not read by the app today; kept for the record)
- `DB_POOL_MAX` (suggest 5)
- `DB_CONNECTION_TIMEOUT_MS` (suggest 15000, to cover a wake-up from scale to zero plus TLS)
- `DB_IDLE_TIMEOUT_MS` (suggest 30000; below 5 min, so idle clients close before the compute suspends)
- `DB_STATEMENT_TIMEOUT_MS` (default 15000)

## Backups and restore test

The Free history window is only 6 hours, so it is not a backup. Keep a **weekly off-host, encrypted `pg_dump`**:
- Use the direct string and a `pg_dump` 18 client.
- Run `pg_dump -Fc --no-owner`, then encrypt the file before it leaves the machine (for example with `age` or `gpg`).
- Store it outside Neon and Render.

Restore test, at least once a quarter:
- Point in time (within 6 hours): Neon Console > project > **Restore**, choose `main`, tab **From history**, pick a timestamp, **Next**, **Restore**. Neon keeps the previous state as a branch `main_old_<timestamp>`. Only rehearse this on a scratch project or right after setup.
- From a dump (preferred check): create a child branch `restore-test` (or a local Docker Postgres 18) and run `pg_restore --no-owner -d "<direct string of restore-test>" backup.dump`. Check row counts of `employees`, `invoices`, `transactions` and `salaries` against production, then delete the branch.
