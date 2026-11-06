import { createHash } from "node:crypto";
import { hashEvidence, type EvidenceBundle } from "@sentinel/evidence";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

export const REGISTRY_PROGRAM_ID = new PublicKey("BZ3PWjMS6g4bkPjr66h5Vb4e2qHyj3To2EDzTT9j5yY6");

export function eventIdToBytes(eventId: string): Buffer {
  if (!/^[a-f0-9]{64}$/.test(eventId)) throw new Error("eventId must be 32-byte lowercase hex");
  return Buffer.from(eventId, "hex");
}

export function findFindingAddress(
  eventId: string,
  programId: PublicKey = REGISTRY_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("finding"), eventIdToBytes(eventId)],
    programId
  );
}

export function findRegistryAddress(
  programId: PublicKey = REGISTRY_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("registry")], programId);
}

export interface DecodedRegistryAccount {
  readonly schemaVersion: number;
  readonly bump: number;
  readonly admin: PublicKey;
  readonly publisher: PublicKey;
}

export function decodeRegistryAccount(data: Uint8Array): DecodedRegistryAccount {
  const buffer = Buffer.from(data);
  const expected = anchorDiscriminator("account", "RegistryConfig");
  if (buffer.length < 75 || !buffer.subarray(0, 8).equals(expected)) {
    throw new Error("Invalid RegistryConfig account data");
  }
  return {
    schemaVersion: buffer.readUInt16LE(8),
    bump: buffer.readUInt8(10),
    admin: new PublicKey(buffer.subarray(11, 43)),
    publisher: new PublicKey(buffer.subarray(43, 75))
  };
}

export interface PublishFindingInput {
  readonly eventId: string;
  readonly cluster: "localnet" | "devnet" | "testnet" | "mainnet-beta";
  readonly kind: "PROGRAM_UPGRADED" | "UPGRADE_AUTHORITY_CHANGED" | "WATCHED_ACCOUNT_CHANGED";
  readonly target: PublicKey;
  readonly slot: bigint;
  readonly evidenceHash: string;
  readonly transactionSignature: Uint8Array;
}

const CLUSTER_VALUES = { localnet: 0, devnet: 1, testnet: 2, "mainnet-beta": 3 } as const;
const KIND_VALUES = {
  PROGRAM_UPGRADED: 0,
  UPGRADE_AUTHORITY_CHANGED: 1,
  WATCHED_ACCOUNT_CHANGED: 2
} as const;

function anchorDiscriminator(namespace: "account" | "global", name: string): Buffer {
  return createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8);
}

export function buildInitializeRegistryInstruction(
  admin: PublicKey,
  publisher: PublicKey,
  programId: PublicKey = REGISTRY_PROGRAM_ID
): TransactionInstruction {
  if (admin.equals(publisher) || publisher.equals(PublicKey.default)) {
    throw new Error("Registry admin and publisher must be distinct non-default keys");
  }
  const [registry] = findRegistryAddress(programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([
      anchorDiscriminator("global", "initialize_registry"),
      publisher.toBuffer()
    ])
  });
}

function hex32(value: string, label: string): Buffer {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be 32-byte lowercase hex`);
  return Buffer.from(value, "hex");
}

export function buildPublishFindingInstruction(
  input: PublishFindingInput,
  publisher: PublicKey,
  programId: PublicKey = REGISTRY_PROGRAM_ID
): TransactionInstruction {
  if (input.transactionSignature.length !== 64) {
    throw new Error("transactionSignature must contain 64 bytes");
  }
  const slot = Buffer.alloc(8);
  slot.writeBigUInt64LE(input.slot);
  const data = Buffer.concat([
    anchorDiscriminator("global", "publish_finding"),
    eventIdToBytes(input.eventId),
    Buffer.from([CLUSTER_VALUES[input.cluster]]),
    Buffer.from([KIND_VALUES[input.kind]]),
    input.target.toBuffer(),
    slot,
    hex32(input.evidenceHash, "evidenceHash"),
    Buffer.from(input.transactionSignature)
  ]);
  const [registry] = findRegistryAddress(programId);
  const [finding] = findFindingAddress(input.eventId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: registry, isSigner: false, isWritable: false },
      { pubkey: finding, isSigner: false, isWritable: true },
      { pubkey: publisher, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data
  });
}

export interface DecodedFindingAccount {
  readonly eventId: string;
  readonly cluster: number;
  readonly kind: number;
  readonly target: PublicKey;
  readonly slot: bigint;
  readonly evidenceHash: string;
  readonly transactionSignature: Uint8Array;
  readonly publisher: PublicKey;
  readonly createdAt: bigint;
  readonly bump: number;
}

export function decodeFindingAccount(data: Uint8Array): DecodedFindingAccount {
  const buffer = Buffer.from(data);
  const expected = anchorDiscriminator("account", "Finding");
  if (buffer.length < 219 || !buffer.subarray(0, 8).equals(expected)) {
    throw new Error("Invalid Finding account data");
  }
  let offset = 8;
  const eventId = buffer.subarray(offset, (offset += 32)).toString("hex");
  const cluster = buffer.readUInt8(offset++);
  const kind = buffer.readUInt8(offset++);
  const target = new PublicKey(buffer.subarray(offset, (offset += 32)));
  const slot = buffer.readBigUInt64LE(offset);
  offset += 8;
  const evidenceHash = buffer.subarray(offset, (offset += 32)).toString("hex");
  const transactionSignature = Uint8Array.from(buffer.subarray(offset, (offset += 64)));
  const publisher = new PublicKey(buffer.subarray(offset, (offset += 32)));
  const createdAt = buffer.readBigInt64LE(offset);
  offset += 8;
  const bump = buffer.readUInt8(offset);
  return {
    eventId,
    cluster,
    kind,
    target,
    slot,
    evidenceHash,
    transactionSignature,
    publisher,
    createdAt,
    bump
  };
}

export function verifyEvidenceCommitment(
  finding: DecodedFindingAccount,
  evidence: EvidenceBundle
): boolean {
  return finding.eventId === evidence.eventId && finding.evidenceHash === hashEvidence(evidence);
}
