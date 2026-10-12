import { defineConfig } from 'vitest/config';

// Tests run against DATABASE_URL (from the root .env) but inside their own Postgres schema,
// which test/global-setup.ts drops and re-creates on every run. Dev data is never touched.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
      DB_SCHEMA: 'hm_test',
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'test-only-session-secret',
    },
  },
});
