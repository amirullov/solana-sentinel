import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "@sentinel/config";
import { Pool } from "pg";
import { deliverWebhook } from "./webhook.js";

interface OutboxJob {
  id: string;
  payload: unknown;
  url: string;
}

const config = loadConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

async function claimJob(): Promise<OutboxJob | undefined> {
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
         available_at = now() + make_interval(secs => LEAST(3600, 15 * power(2, attempts)::int))
     FROM next_job n, webhook_destinations d
     WHERE o.id = n.id AND d.destination_id = o.destination_id
     RETURNING o.id::text, o.payload, d.url`
  );
  return result.rows[0];
}

async function processJob(job: OutboxJob): Promise<void> {
  try {
    await deliverWebhook(job.url, job.payload, config.WEBHOOK_SIGNING_SECRET);
    await pool.query(
      "UPDATE notification_outbox SET delivered_at = now(), last_error = NULL WHERE id = $1",
      [job.id]
    );
  } catch (error) {
    await pool.query("UPDATE notification_outbox SET last_error = $2 WHERE id = $1", [
      job.id,
      error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000)
    ]);
  }
}

async function run(): Promise<void> {
  const once = process.argv.includes("--once");
  while (!controller.signal.aborted) {
    const job = await claimJob();
    if (job) await processJob(job);
    if (once) break;
    if (!job) await delay(1000, undefined, { signal: controller.signal }).catch(() => undefined);
  }
}

void run()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
