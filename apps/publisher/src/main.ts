import { readFile } from "node:fs/promises";
import { loadConfig } from "@sentinel/config";
import { hashEvidence, type EvidenceBundle } from "@sentinel/evidence";
import {
  buildPublishFindingInstruction,
  decodeRegistryAccount,
  findFindingAddress,
  findRegistryAddress
} from "@sentinel/registry-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import bs58 from "bs58";
import { Pool } from "pg";

interface PublishableFinding {
  finding_id: string;
  event_id: string;
  evidence_hash: string;
  evidence: EvidenceBundle;
  event_type: "PROGRAM_UPGRADED" | "UPGRADE_AUTHORITY_CHANGED" | "WATCHED_ACCOUNT_CHANGED";
  cluster: "localnet" | "devnet" | "testnet" | "mainnet-beta";
  target_address: string;
  signature: string;
  slot: string;
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.PUBLISHER_ENABLED) {
    process.stdout.write("Publisher is disabled by default; no transaction was submitted.\n");
    return;
  }

  const secret = JSON.parse(
    await readFile(config.PUBLISHER_KEYPAIR_PATH as string, "utf8")
  ) as number[];
  const publisher = Keypair.fromSecretKey(Uint8Array.from(secret));
  const programId = new PublicKey(config.SENTINEL_REGISTRY_PROGRAM_ID);
  const connection = new Connection(config.SOLANA_RPC_URL, "finalized");
  const program = await connection.getAccountInfo(programId, "finalized");
  if (!program?.executable)
    throw new Error("Configured registry program is not deployed/executable");
  const [registry] = findRegistryAddress(programId);
  const registryAccount = await connection.getAccountInfo(registry, "finalized");
  if (!registryAccount || !registryAccount.owner.equals(programId)) {
    throw new Error("RegistryConfig PDA is not initialized");
  }
  const registryConfig = decodeRegistryAccount(registryAccount.data);
  if (!registryConfig.publisher.equals(publisher.publicKey)) {
    throw new Error("Configured signer is not the registry publisher");
  }

  const pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    const result = await pool.query<PublishableFinding>(
      `SELECT f.finding_id, f.event_id, f.evidence_hash, f.evidence, e.event_type, e.cluster,
              e.target_address, e.signature, e.slot::text
       FROM findings f JOIN chain_events e ON e.event_id = f.event_id
       LEFT JOIN attestations a ON a.finding_id = f.finding_id
       WHERE a.finding_id IS NULL AND e.commitment = 'finalized'
       ORDER BY e.slot LIMIT 1`
    );
    const finding = result.rows[0];
    if (!finding) {
      process.stdout.write("No finalized unpublished finding is available.\n");
      return;
    }
    if (finding.evidence.eventId !== finding.event_id) {
      throw new Error("Finding evidence event ID does not match the persisted event");
    }
    if (hashEvidence(finding.evidence) !== finding.evidence_hash) {
      throw new Error("Finding evidence hash verification failed");
    }
    const [findingAddress] = findFindingAddress(finding.event_id, programId);
    if (await connection.getAccountInfo(findingAddress, "finalized")) {
      throw new Error("Finding PDA already exists but no local attestation is recorded");
    }
    const transactionSignature = bs58.decode(finding.signature);
    const instruction = buildPublishFindingInstruction(
      {
        eventId: finding.event_id,
        cluster: finding.cluster,
        kind: finding.event_type,
        target: new PublicKey(finding.target_address),
        slot: BigInt(finding.slot),
        evidenceHash: finding.evidence_hash,
        transactionSignature
      },
      publisher.publicKey,
      programId
    );
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [publisher], {
      commitment: "finalized",
      preflightCommitment: "finalized"
    });
    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true
    });
    if (!status.value || status.value.err)
      throw new Error("Published transaction was not finalized");
    await pool.query(
      `INSERT INTO attestations
        (finding_id, cluster, registry_program_id, transaction_signature, published_slot, verified_at)
       VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (finding_id) DO NOTHING`,
      [finding.finding_id, finding.cluster, programId.toBase58(), signature, status.value.slot]
    );
    process.stdout.write(`${JSON.stringify({ findingId: finding.finding_id, signature })}\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
