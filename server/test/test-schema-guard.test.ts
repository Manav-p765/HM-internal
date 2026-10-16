// The test run can never touch the dev data in public (see vitest.config.ts and db.ts).
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { assertTestSchema, pool, query } from '../src/db.js';

afterAll(async () => {
  await pool.end();
});

describe('test schema isolation', () => {
  it('this run has its own schema (hm_test_<pid>), and the pool is in it', async () => {
    expect(process.env.DB_SCHEMA).toMatch(/^hm_test_[0-9]+$/);
    const [row] = await query<{ schema: string }>('SELECT current_schema() AS schema');
    expect(row.schema).toBe(process.env.DB_SCHEMA);
  });

  it('a connection whose test schema is missing falls through to public, and destructive statements are refused', async () => {
    // What happened when another run dropped a shared hm_test mid-run: search_path pointed at a missing schema.
    const missing = `hm_test_missing_${process.pid}`;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${missing},public` });
    await client.connect();
    try {
      const { rows } = await client.query<{ schema: string }>('SELECT current_schema() AS schema');
      expect(rows[0].schema).toBe('public'); // the dangerous fall-through
      await expect(assertTestSchema(client, missing)).rejects.toThrow(/current schema is "public", not the test schema/);
      await expect(assertTestSchema(client, undefined)).rejects.toThrow(/DB_SCHEMA not set/);
    } finally {
      await client.end();
    }
  });

  it('destructive statements through query() still work inside the test schema', async () => {
    await query('DELETE FROM password_tokens WHERE false');
    await query('TRUNCATE sessions');
  });
});
