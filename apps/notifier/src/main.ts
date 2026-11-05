import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "@sentinel/config";
import { Pool } from "pg";
import { claimJob, type OutboxJob } from "./outbox.js";
import { deliverWebhook } from "./webhook.js";

const config = loadConfig();
if (!config.WEBHOOK_SIGNING_SECRET) {
  throw new Error("WEBHOOK_SIGNING_SECRET is required for webhook delivery");
}
const pool = new Pool({ connectionString: config.DATABASE_URL });
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

async function processJob(job: OutboxJob): Promise<void> {
  try {
    await deliverWebhook(job.url, job.payload, config.WEBHOOK_SIGNING_SECRET as string, job.id);
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
    const job = await claimJob(pool);
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
