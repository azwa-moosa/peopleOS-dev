import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { can, SecurityContext } from '@bml/policy';
import { ENV, Env } from './env';
import { logger } from './logger';

export type Tx = PoolClient;

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  pool: Pool;
  /** True when running as the table owner because the restricted runtime role could not be used. */
  singleRoleMode = false;

  constructor(@Inject(ENV) private readonly env: Env) {
    // Runtime role: DML only, not the owner, so Postgres RLS applies to ER/Voice schemas.
    this.pool = new Pool({ connectionString: DbService.runtimeUrl(env), max: 10 });
  }

  /** Explicit DATABASE_URL, else the migrator URL with the app_runtime credentials swapped in. */
  static runtimeUrl(env: Env): string {
    if (env.DATABASE_URL) return env.DATABASE_URL;
    const u = new URL(env.DATABASE_URL_MIGRATOR!);
    u.username = 'app_runtime';
    u.password = env.APP_RUNTIME_PASSWORD ?? 'app_runtime_dev';
    return u.toString();
  }

  async onModuleInit() {
    try {
      await this.pool.query('select 1');
    } catch (e) {
      if (!this.env.DATABASE_URL && this.env.DATABASE_URL_MIGRATOR) {
        // Host did not allow creating app_runtime (no CREATEROLE). Keep the demo running, but say so loudly.
        logger.warn({ err: (e as Error).message }, 'app_runtime unavailable – SINGLE-ROLE MODE: Postgres RLS defence-in-depth and audit grants are NOT active; API-layer policy still enforced. Hosted DEV demo only.');
        await this.pool.end().catch(() => undefined);
        this.pool = new Pool({ connectionString: this.env.DATABASE_URL_MIGRATOR, max: 10 });
        this.singleRoleMode = true;
        await this.pool.query('select 1');
      } else {
        throw e;
      }
    }
  }

  /**
   * Runs `fn` in a transaction with the caller's identity bound for Row-Level Security.
   * Business writes and their audit outbox rows commit or roll back together.
   */
  async tx<T>(ctx: SecurityContext | null, fn: (c: Tx) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      if (ctx) {
        await c.query(`select set_config('app.user_id', $1, true), set_config('app.er_override', $2, true)`,
          [ctx.userId, can(ctx, 'er.case.read_all') ? 'on' : 'off']);
      }
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  query<T = any>(sql: string, params: unknown[] = []) {
    return this.pool.query<T & Record<string, any>>(sql, params);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
