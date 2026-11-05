import { createHash } from "node:crypto";
import type { SolanaCluster } from "@sentinel/core";
import type { EventRepository } from "@sentinel/database";
import { UPGRADEABLE_LOADER_PROGRAM_ID } from "@sentinel/solana-adapters";
import { PublicKey, type Connection } from "@solana/web3.js";
import type { WatchTarget } from "./discovery.js";

/** Establish a finalized byte baseline before subscribing to live account updates. */
export async function seedInitialSnapshots(
  connection: Connection,
  targets: ReadonlyMap<string, WatchTarget>,
  cluster: SolanaCluster,
  repository: EventRepository
): Promise<number> {
  const addresses = [...targets.keys()];
  const response = await connection.getMultipleAccountsInfoAndContext(
    addresses.map((address) => new PublicKey(address)),
    "finalized"
  );
  for (const [index, address] of addresses.entries()) {
    const account = response.value[index];
    const target = targets.get(address);
    if (!account || !target) throw new Error(`Watched account does not exist: ${address}`);
    if (target.loader === "loader-v3" && !account.owner.equals(UPGRADEABLE_LOADER_PROGRAM_ID)) {
      throw new Error(`Watched ProgramData is not owned by loader-v3: ${address}`);
    }
    if (await repository.getLatestSnapshot(cluster, address, Number.MAX_SAFE_INTEGER)) continue;
    await repository.saveSnapshot({
      cluster,
      address,
      slot: response.context.slot,
      dataHash: createHash("sha256").update(account.data).digest("hex"),
      dataBase64: Buffer.from(account.data).toString("base64"),
      commitment: "finalized"
    });
  }
  return response.context.slot;
}
