import { createHash } from "node:crypto";
import { PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import bs58 from "bs58";
import { UPGRADEABLE_LOADER_PROGRAM_ID } from "./loader-v3.js";

export interface CompiledInstructionInput {
  readonly programIdIndex: number;
  readonly accounts: readonly number[];
  readonly data: Uint8Array;
}

export interface TransactionInstructionInput {
  readonly signature: string;
  readonly slot: number;
  readonly accountKeys: readonly string[];
  readonly instructions: readonly CompiledInstructionInput[];
}

export interface InnerInstructionGroupInput {
  readonly index: number;
  readonly instructions: readonly CompiledInstructionInput[];
}

export function flattenTransactionInstructions(
  outer: readonly CompiledInstructionInput[],
  inner: readonly InnerInstructionGroupInput[]
): CompiledInstructionInput[] {
  const groups = new Map<number, CompiledInstructionInput[]>();
  for (const group of inner) {
    if (!Number.isSafeInteger(group.index) || group.index < 0 || group.index >= outer.length) {
      throw new Error("Inner instruction has an invalid outer index");
    }
    const instructions = groups.get(group.index) ?? [];
    instructions.push(...group.instructions);
    groups.set(group.index, instructions);
  }
  return outer.flatMap((instruction, index) => [instruction, ...(groups.get(index) ?? [])]);
}

export function normalizeRpcTransaction(
  signature: string,
  response: VersionedTransactionResponse
): TransactionInstructionInput {
  const loadedAddresses = response.meta?.loadedAddresses;
  const accountKeys = response.transaction.message
    .getAccountKeys(loadedAddresses ? { accountKeysFromLookups: loadedAddresses } : undefined)
    .keySegments()
    .flat()
    .map((key) => key.toBase58());
  const outer = response.transaction.message.compiledInstructions.map((instruction) => ({
    programIdIndex: instruction.programIdIndex,
    accounts: Array.from(instruction.accountKeyIndexes),
    data: Uint8Array.from(instruction.data)
  }));
  const inner = (response.meta?.innerInstructions ?? []).map((group) => ({
    index: group.index,
    instructions: group.instructions.map((instruction) => ({
      programIdIndex: instruction.programIdIndex,
      accounts: Array.from(instruction.accounts),
      data: bs58.decode(instruction.data)
    }))
  }));
  return {
    signature,
    slot: response.slot,
    accountKeys,
    instructions: flattenTransactionInstructions(outer, inner)
  };
}

export interface LoaderV3InstructionFact {
  readonly type: "PROGRAM_UPGRADED" | "UPGRADE_AUTHORITY_CHANGED";
  readonly signature: string;
  readonly slot: number;
  readonly programAddress: string;
  readonly programDataAddress: string;
  readonly instructionIndex: number;
  readonly sourceHash: string;
}

export const LOADER_V3_INSTRUCTION_TAGS = {
  INITIALIZE_BUFFER: 0,
  WRITE: 1,
  DEPLOY_WITH_MAX_DATA_LEN: 2,
  UPGRADE: 3,
  SET_AUTHORITY: 4,
  CLOSE: 5,
  EXTEND_PROGRAM: 6,
  SET_AUTHORITY_CHECKED: 7,
  MIGRATE: 8
} as const;

function sourceHash(transaction: TransactionInstructionInput, instructionIndex: number): string {
  const instruction = transaction.instructions[instructionIndex];
  if (!instruction) throw new Error("Instruction index is out of range");
  return createHash("sha256")
    .update("solana-sentinel:loader-v3-instruction:v1\0")
    .update(transaction.signature)
    .update("\0")
    .update(String(transaction.slot))
    .update("\0")
    .update(String(instructionIndex))
    .update("\0")
    .update(instruction.data)
    .digest("hex");
}

export function parseLoaderV3Instructions(
  transaction: TransactionInstructionInput,
  programByProgramData: ReadonlyMap<string, string>
): LoaderV3InstructionFact[] {
  const facts: LoaderV3InstructionFact[] = [];
  transaction.instructions.forEach((instruction, instructionIndex) => {
    const programId = transaction.accountKeys[instruction.programIdIndex];
    if (programId !== UPGRADEABLE_LOADER_PROGRAM_ID.toBase58() || instruction.data.length < 4) {
      return;
    }
    const tag = Buffer.from(instruction.data).readUInt32LE(0);
    if (tag === LOADER_V3_INSTRUCTION_TAGS.UPGRADE) {
      const programDataAddress = transaction.accountKeys[instruction.accounts[0] ?? -1];
      const programAddress = transaction.accountKeys[instruction.accounts[1] ?? -1];
      if (!programDataAddress || !programAddress) return;
      if (programByProgramData.get(programDataAddress) !== programAddress) return;
      facts.push({
        type: "PROGRAM_UPGRADED",
        signature: transaction.signature,
        slot: transaction.slot,
        programAddress,
        programDataAddress,
        instructionIndex,
        sourceHash: sourceHash(transaction, instructionIndex)
      });
      return;
    }
    if (
      tag === LOADER_V3_INSTRUCTION_TAGS.SET_AUTHORITY ||
      tag === LOADER_V3_INSTRUCTION_TAGS.SET_AUTHORITY_CHECKED
    ) {
      const programDataAddress = transaction.accountKeys[instruction.accounts[0] ?? -1];
      if (!programDataAddress) return;
      const programAddress = programByProgramData.get(programDataAddress);
      if (!programAddress) return;
      facts.push({
        type: "UPGRADE_AUTHORITY_CHANGED",
        signature: transaction.signature,
        slot: transaction.slot,
        programAddress,
        programDataAddress,
        instructionIndex,
        sourceHash: sourceHash(transaction, instructionIndex)
      });
    }
  });
  return facts;
}

export function publicKeysFromBytes(keys: readonly Uint8Array[]): string[] {
  return keys.map((key) => new PublicKey(key).toBase58());
}
