import { createHash } from "node:crypto";
import {
  createEventId,
  parseChainEvent,
  type ChainEvent,
  type SolanaCluster
} from "@sentinel/core";
import type { EventRepository } from "@sentinel/database";
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
  if (before && before.equals(after)) return undefined;
  if (observation.loader !== "loader-v3" || !before) return "WATCHED_ACCOUNT_CHANGED";

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
  const type = classifyObservation(observation);
  if (!type) return { status: "ignored" };

  const identity = {
    cluster: observation.cluster,
    targetAddress: observation.address,
    signature: observation.signature,
    type
  } as const;
  const event = parseChainEvent({
    eventId: createEventId(identity),
    type,
    cluster: observation.cluster,
    targetAddress: observation.address,
    programAddress: observation.programAddress,
    signature: observation.signature,
    slot: observation.slot,
    commitment: observation.commitment,
    observedAt: observation.observedAt,
    beforeHash: observation.beforeBase64
      ? sha256(Buffer.from(observation.beforeBase64, "base64"))
      : undefined,
    afterHash: sha256(Buffer.from(observation.afterBase64, "base64"))
  });
  const status = await repository.save(event);
  return { status, event };
}
