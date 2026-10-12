// Runs once before the test files: fresh hm_test schema + all migrations.
process.env.NODE_ENV = 'test';
process.env.DB_SCHEMA = 'hm_test';
process.env.SESSION_SECRET ??= 'test-only-session-secret';

export async function setup() {
  const { pool } = await import('../src/db.js');
  const { runMigrations } = await import('../src/migrations.js');
  await pool.query('DROP SCHEMA IF EXISTS hm_test CASCADE');
  await pool.query('CREATE SCHEMA hm_test');
  await runMigrations(() => {});
  await pool.end();
}

export async function teardown() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS hm_test CASCADE');
  await client.end();
}
