import { InMemoryEventRepository } from "@sentinel/database";
import { describe, expect, it } from "vitest";
import { processObservation, type AccountObservation } from "./pipeline.js";

const observation: AccountObservation = {
  cluster: "devnet",
  address: "Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4",
  signature: "5".repeat(64),
  slot: 42,
  commitment: "finalized",
  observedAt: "2026-11-04T00:00:00.000Z",
  loader: "watched-account",
  beforeBase64: Buffer.from([1]).toString("base64"),
  afterBase64: Buffer.from([2]).toString("base64")
};

describe("indexer pipeline", () => {
  it("is idempotent for duplicate delivery", async () => {
    const repository = new InMemoryEventRepository();
    expect((await processObservation(observation, repository)).status).toBe("inserted");
    expect((await processObservation(observation, repository)).status).toBe("duplicate");
    expect(repository.events.size).toBe(1);
  });

  it("ignores byte-identical account updates", async () => {
    const repository = new InMemoryEventRepository();
    const result = await processObservation(
      { ...observation, afterBase64: observation.beforeBase64 as string },
      repository
    );
    expect(result.status).toBe("ignored");
  });
});
