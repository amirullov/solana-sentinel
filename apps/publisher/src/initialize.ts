import { readFile } from "node:fs/promises";
import { loadConfig } from "@sentinel/config";
import {
  buildInitializeRegistryInstruction,
  decodeRegistryAccount,
  findRegistryAddress
} from "@sentinel/registry-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction
} from "@solana/web3.js";

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.SOLANA_CLUSTER !== "devnet") throw new Error("Initialization script is devnet only");
  const adminPath = process.argv[2];
  const publisherAddress = process.argv[3];
  if (!adminPath || !publisherAddress) {
    throw new Error("Usage: node dist/initialize.js ADMIN_KEYPAIR_PATH PUBLISHER_PUBKEY");
  }
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(await readFile(adminPath, "utf8")) as number[])
  );
  const publisher = new PublicKey(publisherAddress);
  const programId = new PublicKey(config.SENTINEL_REGISTRY_PROGRAM_ID);
  const connection = new Connection(config.SOLANA_RPC_URL, "finalized");
  const program = await connection.getAccountInfo(programId, "finalized");
  if (!program?.executable) throw new Error("Registry program is not deployed on devnet");
  const [registry] = findRegistryAddress(programId);
  const existing = await connection.getAccountInfo(registry, "finalized");
  if (existing) {
    if (!existing.owner.equals(programId)) throw new Error("Registry PDA has unexpected owner");
    const state = decodeRegistryAccount(existing.data);
    if (!state.admin.equals(admin.publicKey) || !state.publisher.equals(publisher)) {
      throw new Error("Existing registry authority configuration differs from requested keys");
    }
    process.stdout.write(
      `${JSON.stringify({ registry: registry.toBase58(), alreadyInitialized: true })}\n`
    );
    return;
  }
  const instruction = buildInitializeRegistryInstruction(admin.publicKey, publisher, programId);
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [admin],
    { commitment: "finalized", preflightCommitment: "finalized" }
  );
  const account = await connection.getAccountInfo(registry, "finalized");
  if (!account?.owner.equals(programId)) throw new Error("Registry PDA was not created");
  const state = decodeRegistryAccount(account.data);
  if (!state.admin.equals(admin.publicKey) || !state.publisher.equals(publisher)) {
    throw new Error("Registry authority verification failed");
  }
  process.stdout.write(`${JSON.stringify({ registry: registry.toBase58(), signature })}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
