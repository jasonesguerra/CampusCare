import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('Set PGPASSWORD for this terminal before running db:create.');
  process.exit(1);
}

const client = new Client({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: 'postgres',
  user: process.env.PGUSER || 'postgres',
  password,
});

await client.connect();
const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['campuscare']);
if (!existing.rowCount) {
  await client.query('CREATE DATABASE campuscare');
  console.log('Created database campuscare');
} else {
  console.log('Database campuscare already exists');
}
await client.end();
