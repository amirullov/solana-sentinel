import { createHash } from "node:crypto";
import {
  createEventId,
  parseChainEvent,
  type ChainEvent,
  type SolanaCluster
} from "@sentinel/core";
import type { EventRepository } from "@sentinel/database";
import { detectFinding } from "@sentinel/detection";
import { decodeUpgradeableLoaderState } from "@sentinel/solana-adapters";

export interface AccountObservation {
  readonly cluster: SolanaCluster;
  readonly address: string;
  readonly programAddress?: string;
  readonly signature: string;
  readonly slot: number;
  readonly commitment: "processed" | "confirmed" | "finalized";
  readonly observedAt: string;
  readonly loader: "loader-v3" | "watched-account";
  readonly eventTypeHint?: ChainEvent["type"];
  readonly beforeBase64?: string;
  readonly afterBase64: string;
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function classifyObservation(
  observation: AccountObservation
): ChainEvent["type"] | undefined {
  const before = observation.beforeBase64
    ? Buffer.from(observation.beforeBase64, "base64")
    : undefined;
  const after = Buffer.from(observation.afterBase64, "base64");
  if (observation.eventTypeHint) return observation.eventTypeHint;
  if (before && before.equals(after)) return undefined;
  if (!before) return undefined;
  if (observation.loader !== "loader-v3") return "WATCHED_ACCOUNT_CHANGED";

  const previousState = decodeUpgradeableLoaderState(before);
  const nextState = decodeUpgradeableLoaderState(after);
  if (previousState.kind !== "programData" || nextState.kind !== "programData") {
    return "WATCHED_ACCOUNT_CHANGED";
  }
  if (previousState.upgradeAuthority !== nextState.upgradeAuthority) {
    return "UPGRADE_AUTHORITY_CHANGED";
  }
  return Buffer.from(previousState.bytecode).equals(Buffer.from(nextState.bytecode))
    ? undefined
    : "PROGRAM_UPGRADED";
}

export async function processObservation(
  observation: AccountObservation,
  repository: EventRepository
): Promise<{ readonly status: "ignored" | "inserted" | "duplicate"; readonly event?: ChainEvent }> {
  const previous = observation.beforeBase64
    ? undefined
    : await repository.getLatestSnapshot(observation.cluster, observation.address);
  const enriched: AccountObservation = {
    ...observation,
    ...(observation.beforeBase64
      ? {}
      : previous?.dataBase64
        ? { beforeBase64: previous.dataBase64 }
        : {})
  };
  const afterData = Buffer.from(enriched.afterBase64, "base64");
  const afterHash = sha256(afterData);
  await repository.saveSnapshot({
    cluster: enriched.cluster,
    address: enriched.address,
    slot: enriched.slot,
    dataHash: afterHash,
    dataBase64: enriched.afterBase64,
    signature: enriched.signature,
    commitment: enriched.commitment
  });

  const type = classifyObservation(enriched);
  if (!type) return { status: "ignored" };

  const identity = {
    cluster: enriched.cluster,
    targetAddress: enriched.address,
    signature: enriched.signature,
    type
  } as const;
  const event = parseChainEvent({
    eventId: createEventId(identity),
    type,
    cluster: enriched.cluster,
    targetAddress: enriched.address,
    programAddress: enriched.programAddress,
    signature: enriched.signature,
    slot: enriched.slot,
    commitment: enriched.commitment,
    observedAt: enriched.observedAt,
    sourceHash: sha256(
      Buffer.from(
        `${enriched.cluster}\0${enriched.signature}\0${enriched.slot}\0${enriched.address}\0${afterHash}`,
        "utf8"
      )
    ),
    beforeHash: enriched.beforeBase64
      ? sha256(Buffer.from(enriched.beforeBase64, "base64"))
      : undefined,
    afterHash
  });
  const status = await repository.saveDetected(event, detectFinding(event));
  return { status, event };
}
