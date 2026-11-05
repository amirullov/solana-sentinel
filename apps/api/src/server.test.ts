import { describe, expect, it } from "vitest";
import { assessIndexerStatus, buildServer } from "./server.js";

const integrationTest = process.env.DATABASE_URL_INTEGRATION ? it : it.skip;

describe("API status and input validation", () => {
  it("does not call PostgreSQL for malformed finding IDs", async () => {
    const app = buildServer({ databaseUrl: "postgres://invalid:invalid@127.0.0.1:1/invalid" });
    try {
      const response = await app.inject({ method: "GET", url: "/v1/findings/not-a-uuid/evidence" });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("requires a recent healthy heartbeat and observed chain lag", () => {
    const now = Date.now();
    const checkpoint = {
      source_id: "yellowstone:devnet",
      cluster: "devnet",
      finalized_slot: "42",
      observed_finalized_slot: "42",
      lag_slots: "0",
      cursor_signature: null,
      updated_at: new Date(now)
    };
    const heartbeat = {
      service_id: "indexer",
      state: "healthy" as const,
      heartbeat_at: new Date(now)
    };
    expect(assessIndexerStatus([checkpoint], [], now).state).toBe("degraded");
    expect(assessIndexerStatus([{ ...checkpoint, lag_slots: null }], [heartbeat], now).state).toBe(
      "degraded"
    );
    expect(assessIndexerStatus([checkpoint], [heartbeat], now).state).toBe("operational");
    expect(
      assessIndexerStatus(
        [{ ...checkpoint, source_id: "rpc:devnet:program", updated_at: new Date(0) }, checkpoint],
        [heartbeat],
        now
      ).state
    ).toBe("operational");
    expect(assessIndexerStatus([], [heartbeat], now).state).toBe("not-configured");
  });

  integrationTest("reads status from the migrated PostgreSQL schema", async () => {
    const app = buildServer({ databaseUrl: process.env.DATABASE_URL_INTEGRATION as string });
    try {
      const response = await app.inject({ method: "GET", url: "/v1/status" });
      expect(response.statusCode).toBe(200);
      const payload = response.json<{
        checkpoints: unknown;
        services: unknown;
        claims: { mainnetDeployed: boolean; verifiedBuild: boolean };
      }>();
      expect(Array.isArray(payload.checkpoints)).toBe(true);
      expect(Array.isArray(payload.services)).toBe(true);
      expect(payload.claims).toEqual({ mainnetDeployed: false, verifiedBuild: false });
    } finally {
      await app.close();
    }
  });
});
