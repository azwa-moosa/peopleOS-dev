/**
 * Migration runner. Plain, reviewable SQL files applied in order inside a transaction each,
 * tracked in public.schema_migrations. grants.sql is re-applied after every run.
 *   pnpm db:migrate            apply pending migrations
 *   pnpm db:reset              DEV ONLY: drop all platform schemas, re-migrate, re-seed
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../../.env') });

const SCHEMAS = ['platform', 'org', 'config', 'audit', 'ai', 'synthetic_hris', 'actions', 'er'];
const MIGRATIONS_DIR = resolve(__dirname, '../migrations');

export async function migrate(opts: { reset?: boolean } = {}) {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (!url) throw new Error('DATABASE_URL_MIGRATOR is not set');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    if (opts.reset) {
      if (process.env.PLATFORM_ENV !== 'dev') throw new Error('Refusing to reset a non-dev database');
      console.log('Resetting DEV database …');
      await db.query(`drop schema if exists ${SCHEMAS.join(', ')} cascade`);
      await db.query('drop table if exists public.schema_migrations');
    }

    // Runtime role: DML only, never owner → subject to RLS.
    const pw = process.env.APP_RUNTIME_PASSWORD ?? 'app_runtime_dev';
    const exists = await db.query(`select 1 from pg_roles where rolname = 'app_runtime'`);
    let runtimeRole = !!exists.rowCount;
    if (!runtimeRole) {
      try {
        await db.query(`create role app_runtime login password '${pw.replace(/'/g, "''")}' nobypassrls`);
        runtimeRole = true;
      } catch (e) {
        // Some managed hosts do not grant CREATEROLE. The API then runs in single-role mode (hosted DEV only).
        console.warn(`  ! Could not create role app_runtime (${(e as Error).message}). Continuing in SINGLE-ROLE MODE – RLS defence-in-depth disabled.`);
      }
    } else {
      // Keep the password in step with the environment (hosted secrets may be regenerated).
      await db.query(`alter role app_runtime password '${pw.replace(/'/g, "''")}'`).catch(() => undefined);
    }

    await db.query(`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
    const done = new Set((await db.query('select name from public.schema_migrations')).rows.map((r) => r.name));
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
      await db.query('begin');
      try {
        await db.query(sql);
        await db.query('insert into public.schema_migrations(name) values ($1)', [f]);
        await db.query('commit');
        console.log(`  ✔ ${f}`);
      } catch (e) {
        await db.query('rollback');
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
    if (runtimeRole) {
      await db.query(readFileSync(resolve(__dirname, '../grants.sql'), 'utf8'));
      console.log('  ✔ grants.sql');
    } else {
      console.warn('  ! grants.sql skipped (no app_runtime role)');
    }
    console.log('Migrations up to date.');
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  migrate({ reset: process.argv.includes('--reset') }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
