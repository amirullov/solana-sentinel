import { randomBytes, randomUUID } from "node:crypto";
import { createFindingId, FindingSchema, parseChainEvent } from "@sentinel/core";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresEventRepository } from "./index.js";

const integrationUrl = process.env.DATABASE_URL_INTEGRATION;

describe.skipIf(!integrationUrl)("PostgreSQL event transaction", () => {
  const pool = new Pool({ connectionString: integrationUrl });
  const repository = new PostgresEventRepository(pool);
  const destinationId = `test-${randomUUID()}`;
  const disabledDestinationId = `test-disabled-${randomUUID()}`;
  const snapshotAddress = `test-${randomUUID()}`;
  const eventId = randomBytes(32).toString("hex");
  const findingId = createFindingId(eventId, "test-rule", 1);

  afterAll(async () => {
    await pool.query("DELETE FROM notification_outbox WHERE finding_id = $1", [findingId]);
    await pool.query("DELETE FROM findings WHERE finding_id = $1", [findingId]);
    await pool.query("DELETE FROM chain_events WHERE event_id = $1", [eventId]);
    await pool.query("DELETE FROM webhook_destinations WHERE destination_id IN ($1, $2)", [
      destinationId,
      disabledDestinationId
    ]);
    await pool.query("DELETE FROM account_snapshots WHERE address = $1", [snapshotAddress]);
    await repository.close();
  });

  it("persists a finding and one delivery job atomically, without duplicate jobs", async () => {
    await pool.query(
      `INSERT INTO webhook_destinations (destination_id, url, enabled)
       VALUES ($1, 'https://example.com/sentinel', true),
              ($2, 'https://example.com/disabled', false)`,
      [destinationId, disabledDestinationId]
    );
    const observedAt = new Date().toISOString();
    const event = parseChainEvent({
      eventId,
      type: "PROGRAM_UPGRADED",
      cluster: "devnet",
      targetAddress: snapshotAddress,
      signature: "1".repeat(64),
      slot: 123,
      commitment: "finalized",
      observedAt,
      sourceHash: randomBytes(32).toString("hex")
    });
    const finding = FindingSchema.parse({
      findingId,
      eventId,
      ruleId: "test-rule",
      ruleVersion: 1,
      severity: "medium",
      title: "Integration test finding",
      evidenceHash: randomBytes(32).toString("hex"),
      evidence: { schema: "solana-sentinel/evidence/v1", eventId, facts: {}, sources: [] },
      createdAt: observedAt
    });

    expect(await repository.saveDetected(event, finding)).toBe("inserted");
    expect(await repository.saveDetected(event, finding)).toBe("duplicate");

    const result = await pool.query<{
      destination_id: string;
      payload: Record<string, unknown>;
    }>("SELECT destination_id, payload FROM notification_outbox WHERE finding_id = $1", [
      findingId
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.destination_id).toBe(destinationId);
    expect(result.rows[0]?.payload).toMatchObject({
      schema: "solana-sentinel/webhook/v1",
      findingId,
      eventId,
      ruleId: "test-rule",
      eventType: "PROGRAM_UPGRADED",
      slot: 123
    });
  });

  it("reads only snapshots before the requested slot", async () => {
    await repository.saveSnapshot({
      cluster: "devnet",
      address: snapshotAddress,
      slot: 200,
      dataHash: randomBytes(32).toString("hex"),
      dataBase64: "Yg==",
      commitment: "finalized"
    });
    await repository.saveSnapshot({
      cluster: "devnet",
      address: snapshotAddress,
      slot: 100,
      dataHash: randomBytes(32).toString("hex"),
      dataBase64: "YQ==",
      commitment: "finalized"
    });
    expect((await repository.getLatestSnapshot("devnet", snapshotAddress, 150))?.slot).toBe(100);
    expect(await repository.getLatestSnapshot("devnet", snapshotAddress, 100)).toBeUndefined();
  });
});
