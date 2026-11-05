import type { Client, Pool } from "pg";

export interface OutboxJob {
  readonly id: string;
  readonly payload: unknown;
  readonly url: string;
}

export async function claimJob(pool: Pool | Client): Promise<OutboxJob | undefined> {
  const result = await pool.query<OutboxJob>(
    `WITH next_job AS (
       SELECT o.id FROM notification_outbox o
       JOIN webhook_destinations d ON d.destination_id = o.destination_id
       WHERE o.delivered_at IS NULL AND o.available_at <= now() AND d.enabled
       ORDER BY o.available_at, o.id
       FOR UPDATE OF o SKIP LOCKED LIMIT 1
     )
     UPDATE notification_outbox o
     SET attempts = attempts + 1,
         available_at = now() + make_interval(
           secs => LEAST(3600, 15 * power(2.0, LEAST(attempts, 8)))::integer
         )
     FROM next_job n, webhook_destinations d
     WHERE o.id = n.id AND d.destination_id = o.destination_id
     RETURNING o.id::text, o.payload, d.url`
  );
  return result.rows[0];
}
