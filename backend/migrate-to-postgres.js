import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createPostgresStore } from './postgres-store.js';

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('Set PGPASSWORD for this terminal before running db:migrate.');
  process.exit(1);
}

process.env.PGDATABASE = process.env.PGDATABASE || 'campuscare';
const store = createPostgresStore();
await store.read();
await store.close();
console.log('Migrated CampusCare data into PostgreSQL database campuscare');
