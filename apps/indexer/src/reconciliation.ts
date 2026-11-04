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
  const summary = { addresses: 0, signatures: 0, transactions: 0, inserted: 0, duplicates: 0 };
  for (const programDataAddress of programByProgramData.keys()) {
    summary.addresses += 1;
    const sourceId = `rpc:${options.cluster}:${programDataAddress}`;
    const checkpoint = await repository.getCheckpoint(sourceId);
    const signatures: Awaited<ReturnType<Connection["getSignaturesForAddress"]>> = [];
    let before: string | undefined;
    while (signatures.length < options.maxSignatures) {
      const page = await connection.getSignaturesForAddress(
        new PublicKey(programDataAddress),
        {
          limit: Math.min(1000, options.maxSignatures - signatures.length),
          ...(before ? { before } : {}),
          ...(checkpoint?.cursorSignature ? { until: checkpoint.cursorSignature } : {})
        },
        "finalized"
      );
      signatures.push(...page);
      if (page.length < 1000 || page.length === 0) break;
      before = page.at(-1)?.signature;
    }
    if (checkpoint && signatures.length >= options.maxSignatures) {
      throw new Error(
        `RPC reconciliation gap for ${programDataAddress} exceeds ${options.maxSignatures} signatures`
      );
    }
    summary.signatures += signatures.length;
    for (const info of signatures.toReversed()) {
      if (info.err) continue;
      const response = await connection.getTransaction(info.signature, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0
      });
      if (!response) continue;
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
    const newest = signatures[0];
    if (newest) {
      await repository.advanceCheckpoint({
        sourceId,
        cluster: options.cluster,
        finalizedSlot: newest.slot,
        cursorSignature: newest.signature,
        observedFinalizedSlot: await connection.getSlot("finalized")
      });
    }
  }
  return summary;
}
