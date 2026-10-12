import pg from 'pg';
import { config } from './config.js';

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates shifted to local time.
// NUMERIC already comes back as a string, which is what we want for money.
pg.types.setTypeParser(pg.types.builtins.DATE, value => value);

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

pool.on('error', err => {
  console.error('Unexpected Postgres pool error', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
