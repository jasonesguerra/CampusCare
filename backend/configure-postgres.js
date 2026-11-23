import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const hbaPath = 'C:\\Program Files\\PostgreSQL\\17\\data\\pg_hba.conf';
const backupPath = `${hbaPath}.campuscare-backup`;
const pgCtl = 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe';
const dataDir = 'C:\\Program Files\\PostgreSQL\\17\\data';

await copyFile(hbaPath, backupPath);

try {
  const original = await readFile(hbaPath, 'utf8');
  const temporaryTrust = original
    .replace('local   all             all                                     scram-sha-256', 'local   all             all                                     trust')
    .replace('host    all             all             127.0.0.1/32            scram-sha-256', 'host    all             all             127.0.0.1/32            trust')
    .replace('host    all             all             ::1/128                 scram-sha-256', 'host    all             all             ::1/128                 trust');
  await writeFile(hbaPath, temporaryTrust, 'utf8');
  await execFileAsync(pgCtl, ['reload', '-D', dataDir]);

  const client = new pg.Client({ host: '127.0.0.1', port: 5432, database: 'postgres', user: 'postgres' });
  await client.connect();
  const password = randomBytes(24).toString('base64url');
  await client.query(`ALTER ROLE postgres PASSWORD '${password}'`);
  await client.end();

  await writeFile(hbaPath, original, 'utf8');
  await execFileAsync(pgCtl, ['reload', '-D', dataDir]);

  await writeFile('.env', `PGHOST=127.0.0.1\nPGPORT=5432\nPGDATABASE=campuscare\nPGUSER=postgres\nPGPASSWORD=${password}\nUSE_POSTGRES=true\nDATABASE_URL=postgresql://postgres:${password}@127.0.0.1:5432/campuscare\n`, 'utf8');
  console.log('PostgreSQL password was reset and .env was configured.');
} catch (error) {
  try {
    await copyFile(backupPath, hbaPath);
    await execFileAsync(pgCtl, ['reload', '-D', dataDir]);
  } catch {}
  console.error(error.message);
  process.exitCode = 1;
}
