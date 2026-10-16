import { defineConfig } from 'vitest/config';

// Tests run against DATABASE_URL (from the root .env) but inside their own Postgres schema, which
// test/global-setup.ts creates for this run and drops at the end. Dev data is never touched:
//   - the schema name is unique per run (hm_test_<pid>), so two test runs on the same database (another
//     checkout or worktree, another terminal) can never drop each other's schema mid-run;
//   - db.ts refuses TRUNCATE/DROP/DELETE in tests unless the connection's current schema really is this
//     test schema (if it were missing, search_path would otherwise fall through to public).
const TEST_SCHEMA = (process.env.HM_TEST_SCHEMA ??= `hm_test_${process.pid}`);

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
      DB_SCHEMA: TEST_SCHEMA,
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'test-only-session-secret',
    },
  },
});
