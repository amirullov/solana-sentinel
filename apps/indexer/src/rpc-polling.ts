import { setTimeout as delay } from "node:timers/promises";
import type { SolanaCluster } from "@sentinel/core";
import type { EventRepository } from "@sentinel/database";
import type { Connection } from "@solana/web3.js";
import { reconcileLoaderV3 } from "./reconciliation.js";

export interface RpcPollingOptions {
  readonly cluster: SolanaCluster;
  readonly maxSignatures: number;
  readonly intervalMs?: number;
}

export async function runRpcPolling(
  connection: Connection,
  programByProgramData: ReadonlyMap<string, string>,
  repository: EventRepository,
  options: RpcPollingOptions,
  signal: AbortSignal
): Promise<void> {
  if (programByProgramData.size === 0) {
    throw new Error("RPC polling requires at least one watched loader-v3 program");
  }
  const intervalMs = options.intervalMs ?? 30_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
    throw new Error("RPC polling interval must be at least 1000 ms");
  }

  while (!signal.aborted) {
    const summary = await reconcileLoaderV3(connection, programByProgramData, repository, options);
    const finalizedSlot = await connection.getSlot("finalized");
    await repository.updateServiceStatus({
      serviceId: "indexer",
      state: "healthy",
      details: { mode: "rpc-poll", cluster: options.cluster, finalizedSlot, summary }
    });
    if (signal.aborted) break;
    try {
      await delay(intervalMs, undefined, { signal });
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}
