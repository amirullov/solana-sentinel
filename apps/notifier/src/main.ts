import { loadConfig } from "@sentinel/config";
import { Pool } from "pg";

const config = loadConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });

async function inspectOutbox(): Promise<void> {
  const result = await pool.query<{ pending: number }>(
    "SELECT count(*)::int AS pending FROM notification_outbox WHERE delivered_at IS NULL"
  );
  process.stdout.write(`${JSON.stringify({ pending: result.rows[0]?.pending ?? 0 })}\n`);
  await pool.end();
}

void inspectOutbox().catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  await pool.end();
  process.exitCode = 1;
});
