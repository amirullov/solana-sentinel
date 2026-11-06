import type { Connection } from "@solana/web3.js";
import { InMemoryEventRepository, type ServiceStatus } from "@sentinel/database";
import { describe, expect, it, vi } from "vitest";
import { runRpcPolling } from "./rpc-polling.js";

describe("free RPC polling mode", () => {
  it("records a finalized checkpoint and stops cleanly", async () => {
    const repository = new InMemoryEventRepository();
    const controller = new AbortController();
    const updateStatus = repository.updateServiceStatus.bind(repository);
    let observedStatus: ServiceStatus | undefined;
    vi.spyOn(repository, "updateServiceStatus").mockImplementation(async (status) => {
      observedStatus = status;
      await updateStatus(status);
      controller.abort();
    });
    const connection = {
      getSlot: () => Promise.resolve(123),
      getSignaturesForAddress: () =>
        Promise.resolve([{ signature: "baseline", slot: 123, err: { InstructionError: [0, 1] } }])
    } as unknown as Connection;
    const programData = "11111111111111111111111111111111";

    await runRpcPolling(
      connection,
      new Map([[programData, "22222222222222222222222222222222"]]),
      repository,
      { cluster: "devnet", maxSignatures: 10 },
      controller.signal
    );

    expect((await repository.getCheckpoint(`rpc:devnet:${programData}`))?.finalizedSlot).toBe(123);
    expect(observedStatus).toMatchObject({ state: "healthy", details: { mode: "rpc-poll" } });
  });
});
