// Applies server/db/migrations/*.sql in filename order, each in its own transaction,
// and records applied files in schema_migrations.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../db/migrations');

// Arbitrary constant so two migrate runs can't interleave.
const LOCK_ID = 727274;

export async function runMigrations(log: (message: string) => void = console.log): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
        r => r.filename,
      ),
    );
    const files = (await fs.readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
    const pending = files.filter(f => !applied.has(f));

    for (const file of pending) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      log(`Applying ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return pending.length;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}
