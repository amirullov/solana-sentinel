import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { claimJob } from "./outbox.js";

const integrationTest = process.env.DATABASE_URL_INTEGRATION ? it : it.skip;

describe("PostgreSQL notifier outbox", () => {
  integrationTest("claims one job and caps retry delay after many failures", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL_INTEGRATION });
    await client.connect();
    try {
      // Temporary tables isolate this SQL behavior from other integration tests and real data.
      await client.query(`CREATE TEMP TABLE webhook_destinations (
        destination_id text PRIMARY KEY, url text NOT NULL, enabled boolean NOT NULL
      )`);
      await client.query(`CREATE TEMP TABLE notification_outbox (
        id bigserial PRIMARY KEY, destination_id text NOT NULL, payload jsonb NOT NULL,
        delivered_at timestamptz, available_at timestamptz NOT NULL, attempts integer NOT NULL
      )`);
      await client.query(
        "INSERT INTO webhook_destinations VALUES ('test', 'https://example.com/hook', true)"
      );
      await client.query(
        `INSERT INTO notification_outbox (destination_id, payload, available_at, attempts)
         VALUES ('test', '{"findingId":"test"}'::jsonb, now() - interval '1 minute', 100)`
      );

      const job = await claimJob(client);
      expect(job).toMatchObject({
        id: "1",
        url: "https://example.com/hook",
        payload: { findingId: "test" }
      });
      expect(await claimJob(client)).toBeUndefined();

      const result = await client.query<{ attempts: number; delay_seconds: number }>(
        `SELECT attempts,
                EXTRACT(EPOCH FROM (available_at - now()))::integer AS delay_seconds
         FROM notification_outbox WHERE id = 1`
      );
      expect(result.rows[0]?.attempts).toBe(101);
      expect(result.rows[0]?.delay_seconds).toBeGreaterThan(3500);
      expect(result.rows[0]?.delay_seconds).toBeLessThanOrEqual(3600);
    } finally {
      await client.end();
    }
  });
});
