// Runs once per test run: a fresh schema of its own (name from vitest.config.ts) + all migrations, dropped
// again at the end. Only ever this run's schema: never public, never another run's.
const schema = process.env.HM_TEST_SCHEMA ?? '';
if (!/^hm_test_[0-9]+$/.test(schema)) throw new Error('HM_TEST_SCHEMA is not set by vitest.config.ts');
process.env.NODE_ENV = 'test';
process.env.DB_SCHEMA = schema;
process.env.SESSION_SECRET ??= 'test-only-session-secret';

export async function setup() {
  const { pool } = await import('../src/db.js');
  const { runMigrations } = await import('../src/migrations.js');
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.query(`CREATE SCHEMA ${schema}`);
  await runMigrations(() => {});
  await pool.end();
}

export async function teardown() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await client.end();
}
