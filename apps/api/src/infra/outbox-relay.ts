import { Injectable, OnApplicationBootstrap, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ENV, Env } from './env';
import { DbService } from './db.service';
import { logger } from './logger';

/**
 * Optional in-process outbox → audit relay (EMBEDDED_OUTBOX_RELAY=true) for hosts without a free
 * background worker. Same logic as apps/worker; FOR UPDATE SKIP LOCKED keeps it safe if both run.
 */
@Injectable()
export class EmbeddedOutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private busy = false;
  constructor(@Inject(ENV) private env: Env, private db: DbService) {}

  onApplicationBootstrap() {
    if (!this.env.EMBEDDED_OUTBOX_RELAY) return;
    logger.info('embedded outbox relay enabled');
    this.timer = setInterval(() => this.tick(), 1000);
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    const c = await this.db.pool.connect().catch(() => null);
    if (!c) { this.busy = false; return; }
    try {
      await c.query('begin');
      const { rows } = await c.query(`select id, topic, payload from platform.outbox where processed_at is null order by id limit 200 for update skip locked`);
      for (const r of rows) {
        if (r.topic === 'audit') {
          const p = r.payload;
          await c.query(
            `insert into audit.audit_event(occurred_at, actor_user_id, actor_type, event_type, module, resource_type, resource_id,
               outcome, sensitivity, summary, correlation_id, client_ip_hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [p.occurredAt, p.actorUserId, p.actorType, p.eventType, p.module, p.resourceType, p.resourceId, p.outcome, p.sensitivity,
             p.summary ? JSON.stringify(p.summary) : null, p.correlationId, p.clientIpHash]);
        }
        await c.query(`update platform.outbox set processed_at = now(), attempts = attempts + 1 where id = $1`, [r.id]);
      }
      await c.query('commit');
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      logger.error({ err: (e as Error).message }, 'embedded relay failed – will retry');
    } finally {
      c.release();
      this.busy = false;
    }
  }
}
