// Usage: npm run db:migrate
import { pool } from '../db.js';
import { runMigrations } from '../migrations.js';

try {
  const count = await runMigrations();
  console.log(count === 0 ? 'No pending migrations.' : `Applied ${count} migration(s).`);
} catch (err) {
  console.error((err as Error).message ?? err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
