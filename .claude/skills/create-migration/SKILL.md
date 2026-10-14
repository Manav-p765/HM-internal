---
name: create-migration
description: Add a new numbered SQL migration in server/db/migrations following the project's schema conventions
disable-model-invocation: true
---

# Create a migration

Argument: what the migration should do (e.g. "add leave_requests table"). If unclear, ask.

## Rules

- **Never edit a migration that already exists.** The runner (`server/src/migrations.ts`) records filenames in `schema_migrations` and never re-applies a file, so editing one silently splits dev and production schemas. To change something, write a new migration that alters it. A PreToolUse hook (`.claude/hooks/protect-files.mjs`) blocks edits to existing files in `server/db/migrations/`.
- File name: the next number after the highest in `server/db/migrations/`, zero-padded to 3 digits, snake_case description: `003_leave_requests.sql`. List the directory first to get the number.
- Start with a comment header like the existing files: `-- 003_leave_requests: <one line on what and why>`.
- Each file runs inside a single transaction, so don't use `BEGIN`/`COMMIT` or statements that can't run in a transaction (e.g. `CREATE INDEX CONCURRENTLY`).

## Conventions (from `001_init.sql`)

- Primary key: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
- Emails: `citext` (the extension is already created in 001).
- Money: `numeric(14,2) NOT NULL` (with `DEFAULT 0` where a zero makes sense) and a `CHECK (col >= 0)` (or `> 0`). It reaches the app as a string; keep it that way. Rates/percentages: `numeric(5,2)` with a range check.
- Statuses and enums: `text NOT NULL DEFAULT '<value>' CHECK (col IN ('a', 'b', 'c'))`, lowercase snake_case values, never Postgres enum types.
- Inline column CHECKs get Postgres's default name `<table>_<column>_check` (e.g. `users_role_check`). To change one later: `ALTER TABLE users DROP CONSTRAINT users_role_check, ADD CONSTRAINT users_role_check CHECK (...)`. Give multi-column table CHECKs an explicit name (`CONSTRAINT <table>_<rule>_check CHECK (...)`) so they can be altered too.
- Dates without time: `date`; timestamps: `timestamptz`.
- Foreign keys reference `<table>(id)`; choose `ON DELETE` deliberately (CASCADE for owned child rows, SET NULL for optional links, default RESTRICT otherwise).
- Every app table gets
  ```sql
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
  ```
  plus the trigger, named and written exactly like the ones at the end of `001_init.sql` (the `set_updated_at()` function already exists):
  ```sql
  CREATE TRIGGER <table>_set_updated_at BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  ```
  Append-only tables (like `audit_logs`) skip `updated_at` and the trigger, with a comment saying so.
- Express cross-column invariants as table `CHECK`s (e.g. `CHECK (due_date >= invoice_date)`, `CHECK ((status = 'paid') = (paid_on IS NOT NULL))`).
- Index foreign keys and columns used for filtering/sorting: `CREATE INDEX <table>_<col>_idx ON <table> (<col>);`.
- snake_case for all identifiers.

## Finish

```sh
npm run db:migrate
npm test
```

`db:migrate` applies to the dev database; `npm test` re-creates the `hm_test` schema from all migrations, so it catches a migration that only works on top of existing dev data. If `server/db/seed.dev.sql` inserts into a changed table, update the seed and check `npm run db:seed -- --reset` still works.
