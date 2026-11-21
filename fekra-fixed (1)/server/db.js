import './config.js';
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, // one connection per serverless instance
  ssl: { rejectUnauthorized: false },
});

export const query = (text, params) => pool.query(text, params);

// Runs several queries as one all-or-nothing unit
export async function tx(fn) {
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
