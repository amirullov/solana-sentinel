import { createEventId, parseChainEvent, type SolanaCluster } from "@sentinel/core";
import type { EventRepository } from "@sentinel/database";
import { detectFinding } from "@sentinel/detection";
import {
  parseLoaderV3Instructions,
  type LoaderV3InstructionFact,
  type TransactionInstructionInput
} from "@sentinel/solana-adapters";
import { PublicKey, type Connection } from "@solana/web3.js";

export interface ReconciliationOptions {
  readonly cluster: SolanaCluster;
  readonly maxSignatures: number;
}

export interface ReconciliationSummary {
  readonly addresses: number;
  readonly signatures: number;
  readonly transactions: number;
  readonly inserted: number;
  readonly duplicates: number;
  readonly initialHistoryCapped: number;
}

function normalizeRpcTransaction(
  signature: string,
  slot: number,
  response: NonNullable<Awaited<ReturnType<Connection["getTransaction"]>>>
): TransactionInstructionInput {
  const loadedAddresses = response.meta?.loadedAddresses;
  const keys = response.transaction.message
    .getAccountKeys(loadedAddresses ? { accountKeysFromLookups: loadedAddresses } : undefined)
    .keySegments()
    .flat()
    .map((key) => key.toBase58());
  return {
    signature,
    slot,
    accountKeys: keys,
    instructions: response.transaction.message.compiledInstructions.map((instruction) => ({
      programIdIndex: instruction.programIdIndex,
      accounts: Array.from(instruction.accountKeyIndexes),
      data: Uint8Array.from(instruction.data)
    }))
  };
}

export async function saveLoaderFact(
  fact: LoaderV3InstructionFact,
  cluster: SolanaCluster,
  observedAt: string,
  repository: EventRepository
): Promise<"inserted" | "duplicate"> {
  const event = parseChainEvent({
    eventId: createEventId({
      cluster,
      targetAddress: fact.programDataAddress,
      signature: fact.signature,
      type: fact.type
    }),
    type: fact.type,
    cluster,
    targetAddress: fact.programDataAddress,
    programAddress: fact.programAddress,
    signature: fact.signature,
    slot: fact.slot,
    commitment: "finalized",
    observedAt,
    sourceHash: fact.sourceHash
  });
  return repository.saveDetected(event, detectFinding(event));
}

export async function reconcileLoaderV3(
  connection: Connection,
  programByProgramData: ReadonlyMap<string, string>,
  repository: EventRepository,
  options: ReconciliationOptions
): Promise<ReconciliationSummary> {
  if (!Number.isSafeInteger(options.maxSignatures) || options.maxSignatures < 1) {
    throw new Error("maxSignatures must be a positive safe integer");
  }
  const summary = {
    addresses: 0,
    signatures: 0,
    transactions: 0,
    inserted: 0,
    duplicates: 0,
    initialHistoryCapped: 0
  };
  for (const programDataAddress of programByProgramData.keys()) {
    summary.addresses += 1;
    const sourceId = `rpc:${options.cluster}:${programDataAddress}`;
    const checkpoint = await repository.getCheckpoint(sourceId);
    const coveredSlot = await connection.getSlot("finalized");
    if (checkpoint && coveredSlot < checkpoint.finalizedSlot) {
      throw new Error(`RPC provider is behind the saved checkpoint for ${programDataAddress}`);
    }
    const signatures: Awaited<ReturnType<Connection["getSignaturesForAddress"]>> = [];
    const seen = new Set<string>();
    let before: string | undefined;
    let reachedBoundary = false;
    while (true) {
      const limit = Math.min(
        1000,
        options.maxSignatures - signatures.length + (checkpoint ? 1 : 0)
      );
      if (limit < 1) break;
      const page = await connection.getSignaturesForAddress(
        new PublicKey(programDataAddress),
        {
          limit,
          ...(before ? { before } : {})
        },
        "finalized"
      );
      for (const info of page) {
        if (
          checkpoint &&
          (checkpoint.cursorSignature
            ? info.signature === checkpoint.cursorSignature
            : info.slot <= checkpoint.finalizedSlot)
        ) {
          reachedBoundary = true;
          break;
        }
        if (seen.has(info.signature)) {
          throw new Error(`RPC provider repeated a signature for ${programDataAddress}`);
        }
        if (signatures.length >= options.maxSignatures) {
          throw new Error(
            `RPC reconciliation gap for ${programDataAddress} exceeds ${options.maxSignatures} signatures`
          );
        }
        signatures.push(info);
        seen.add(info.signature);
      }
      if (
        (checkpoint && reachedBoundary) ||
        (!checkpoint && signatures.length >= options.maxSignatures)
      ) {
        if (!checkpoint && page.length === limit) summary.initialHistoryCapped += 1;
        break;
      }
      if (page.length < limit) break;
      const oldest = page.at(-1)?.signature;
      if (!oldest || oldest === before) {
        throw new Error(`RPC pagination did not advance for ${programDataAddress}`);
      }
      before = oldest;
    }
    if (checkpoint && !reachedBoundary) {
      throw new Error(
        `RPC reconciliation cannot reach the saved checkpoint for ${programDataAddress}; history may be pruned`
      );
    }
    summary.signatures += signatures.length;
    for (const info of signatures.toReversed()) {
      if (info.err) continue;
      const response = await connection.getTransaction(info.signature, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0
      });
      if (!response) {
        throw new Error(`RPC transaction unavailable for finalized signature ${info.signature}`);
      }
      summary.transactions += 1;
      const transaction = normalizeRpcTransaction(info.signature, info.slot, response);
      const facts = parseLoaderV3Instructions(transaction, programByProgramData).filter(
        (fact) => fact.programDataAddress === programDataAddress
      );
      for (const fact of facts) {
        const observedAt = response.blockTime
          ? new Date(response.blockTime * 1000).toISOString()
          : new Date().toISOString();
        const status = await saveLoaderFact(fact, options.cluster, observedAt, repository);
        summary[status === "inserted" ? "inserted" : "duplicates"] += 1;
      }
    }
    const cursorSignature = signatures[0]?.signature ?? checkpoint?.cursorSignature;
    await repository.advanceCheckpoint({
      sourceId,
      cluster: options.cluster,
      finalizedSlot: coveredSlot,
      ...(cursorSignature ? { cursorSignature } : {}),
      observedFinalizedSlot: await connection.getSlot("finalized")
    });
  }
  return summary;
}
