import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

export function createPostgresStore({ connectionString, seedFile } = {}) {
  const ssl = process.env.PGSSLMODE === 'require' || process.env.PGSSL === 'true'
    ? { rejectUnauthorized: false }
    : connectionString?.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined;

  const pool = new Pool({
    connectionString,
    ssl,
    host: connectionString ? undefined : process.env.PGHOST || '127.0.0.1',
    port: connectionString ? undefined : Number(process.env.PGPORT || 5432),
    database: connectionString ? undefined : process.env.PGDATABASE || 'campuscare',
    user: connectionString ? undefined : process.env.PGUSER || 'postgres',
    password: connectionString ? undefined : process.env.PGPASSWORD,
  });

  return {
    async read() {
      await ensureSchema(pool);
      const result = await pool.query('SELECT data FROM campuscare_app_state WHERE id = 1');
      if (result.rows.length) return result.rows[0].data;

      const filePath = seedFile || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'store.json');
      const data = JSON.parse(await readFile(filePath, 'utf8'));
      await pool.query(
        'INSERT INTO campuscare_app_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP',
        [JSON.stringify(data)],
      );
      return data;
    },
    async write(data) {
      await ensureSchema(pool);
      await pool.query(
        'INSERT INTO campuscare_app_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP',
        [JSON.stringify(data)],
      );
    },
    async close() {
      await pool.end();
    },
  };
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campuscare_app_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
