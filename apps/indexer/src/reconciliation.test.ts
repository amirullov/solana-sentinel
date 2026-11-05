import type { Connection } from "@solana/web3.js";
import { InMemoryEventRepository } from "@sentinel/database";
import { describe, expect, it } from "vitest";
import { reconcileLoaderV3 } from "./reconciliation.js";

const programDataAddress = "11111111111111111111111111111111";
const targets = new Map([[programDataAddress, "22222222222222222222222222222222"]]);
const options = { cluster: "devnet" as const, maxSignatures: 10 };
const sourceId = `rpc:devnet:${programDataAddress}`;

describe("RPC reconciliation safety", () => {
  it("does not move the checkpoint when its saved cursor is missing", async () => {
    const repository = new InMemoryEventRepository();
    await repository.advanceCheckpoint({
      sourceId,
      cluster: "devnet",
      finalizedSlot: 100,
      cursorSignature: "saved-cursor"
    });
    const connection = {
      getSlot: () => Promise.resolve(200),
      getSignaturesForAddress: () =>
        Promise.resolve([{ signature: "new-signature", slot: 150, err: null }])
    } as unknown as Connection;

    await expect(reconcileLoaderV3(connection, targets, repository, options)).rejects.toThrow(
      "cannot reach the saved checkpoint"
    );
    expect((await repository.getCheckpoint(sourceId))?.cursorSignature).toBe("saved-cursor");
  });

  it("does not advance when a finalized transaction is unavailable", async () => {
    const repository = new InMemoryEventRepository();
    const connection = {
      getSlot: () => Promise.resolve(200),
      getSignaturesForAddress: () =>
        Promise.resolve([{ signature: "new-signature", slot: 150, err: null }]),
      getTransaction: () => Promise.resolve(null)
    } as unknown as Connection;

    await expect(reconcileLoaderV3(connection, targets, repository, options)).rejects.toThrow(
      "transaction unavailable"
    );
    expect(await repository.getCheckpoint(sourceId)).toBeUndefined();
  });
});
