// Loads server/db/seed.dev.sql. Dev only.
// Usage: npm run db:seed            (refuses if the database already has users)
//        npm run db:seed -- --reset (wipes app data first)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV=production. The seed is dev-only fake data.');
  process.exit(1);
}

const { pool, withTransaction } = await import('../db.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const seedFile = path.resolve(here, '../../db/seed.dev.sql');
const reset = process.argv.includes('--reset');

try {
  const sql = await fs.readFile(seedFile, 'utf8');
  await withTransaction(async client => {
    if (reset) {
      await client.query(
        'TRUNCATE transactions, salaries, invoice_items, invoices, auth_tokens, users, employees, sessions',
      );
    } else {
      const { rows } = await client.query<{ count: string }>('SELECT count(*) FROM users');
      if (Number(rows[0].count) > 0) {
        throw new Error('Database already has users. Re-run with `npm run db:seed -- --reset` to wipe and reseed.');
      }
    }
    await client.query(sql);
  });
  console.log(`Seeded dev data from ${path.basename(seedFile)}${reset ? ' (after reset)' : ''}.`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
