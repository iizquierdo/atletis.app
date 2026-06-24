import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ensureUserColumns } from '../src/ensureUserColumns.ts';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('[api] production start');
console.log('[api] PORT:', process.env.PORT ?? '(not set — Railway should inject this)');
console.log('[api] NODE_ENV:', process.env.NODE_ENV ?? '(not set)');
console.log('[api] RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT ?? '(not set)');
console.log('[api] DATABASE_URL:', process.env.DATABASE_URL?.trim() ? 'set' : 'MISSING');
console.log('[api] WEB_ORIGIN:', process.env.WEB_ORIGIN?.trim() || '(not set)');

if (process.env.API_PORT && process.env.RAILWAY_ENVIRONMENT) {
  console.warn(
    '[api] API_PORT is set but ignored on Railway — the app listens on PORT injected by the platform.'
  );
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error('[api] FATAL: DATABASE_URL is required. Link the Postgres plugin to this service.');
  process.exit(1);
}

try {
  console.log('[api] running prisma migrate deploy...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: apiRoot, env: process.env });
} catch {
  console.error('[api] FATAL: prisma migrate deploy failed. Check DATABASE_URL and Postgres logs.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  console.log('[api] ensuring User table columns...');
  await ensureUserColumns(pool);
} finally {
  await pool.end();
}

await import('../src/main.ts');
