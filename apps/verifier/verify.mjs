import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const clusters = ["localnet", "devnet", "testnet", "mainnet-beta"];
const kinds = ["PROGRAM_UPGRADED", "UPGRADE_AUTHORITY_CHANGED", "WATCHED_ACCOUNT_CHANGED"];

export function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("Evidence contains an unsupported value");
}

export function evidenceHash(evidence) {
  return createHash("sha256")
    .update(
      canonicalJson({
        schema: evidence.schema,
        eventId: evidence.eventId,
        facts: evidence.facts,
        sources: evidence.sources
      }),
      "utf8"
    )
    .digest("hex");
}

export function inspectFindingAccount(data) {
  const buffer = Buffer.from(data);
  const discriminator = createHash("sha256").update("account:Finding").digest().subarray(0, 8);
  if (buffer.length < 219 || !buffer.subarray(0, 8).equals(discriminator)) {
    throw new Error("Invalid on-chain Finding account");
  }
  return {
    eventId: buffer.subarray(8, 40).toString("hex"),
    cluster: clusters[buffer.readUInt8(40)],
    kind: kinds[buffer.readUInt8(41)],
    target: new PublicKey(buffer.subarray(42, 74)).toBase58(),
    slot: buffer.readBigUInt64LE(74).toString(),
    evidenceHash: buffer.subarray(82, 114).toString("hex"),
    sourceSignature: buffer.subarray(114, 178)
  };
}

export async function verifyRemote({ apiUrl, findingId, rpcUrl, programId }) {
  const response = await fetch(
    new URL(`/v1/findings/${encodeURIComponent(findingId)}/evidence`, apiUrl)
  );
  if (!response.ok) throw new Error(`Evidence API returned HTTP ${response.status}`);
  const { data } = await response.json();
  if (!data || !/^[0-9a-f]{64}$/.test(data.event_id))
    throw new Error("Invalid evidence API record");
  const connection = new Connection(rpcUrl, "finalized");
  const registryProgram = new PublicKey(programId);
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("finding"), Buffer.from(data.event_id, "hex")],
    registryProgram
  );
  const [program, account] = await Promise.all([
    connection.getAccountInfo(registryProgram, "finalized"),
    connection.getAccountInfo(address, "finalized")
  ]);
  if (!account) throw new Error("Finding PDA does not exist");
  const onChain = inspectFindingAccount(account.data);
  const checks = {
    programExecutable: Boolean(program?.executable),
    accountOwner: account.owner.equals(registryProgram),
    evidenceEventId: data.evidence.eventId === data.event_id,
    apiEvidenceHash: evidenceHash(data.evidence) === data.evidence_hash,
    onChainEvidenceHash: onChain.evidenceHash === data.evidence_hash,
    onChainEventId: onChain.eventId === data.event_id,
    cluster: onChain.cluster === data.cluster,
    kind: onChain.kind === data.event_type,
    target: onChain.target === data.target_address,
    slot: onChain.slot === data.slot,
    sourceSignature: Buffer.from(onChain.sourceSignature).equals(
      Buffer.from(bs58.decode(data.signature))
    ),
    attestationProgramId: data.registry_program_id === registryProgram.toBase58(),
    attestationRecorded: typeof data.attestation_signature === "string"
  };
  const sourceStatus = await connection.getSignatureStatus(data.signature, {
    searchTransactionHistory: true
  });
  checks.sourceFinalized = Boolean(
    sourceStatus.value &&
      !sourceStatus.value.err &&
      sourceStatus.value.confirmationStatus === "finalized" &&
      String(sourceStatus.value.slot) === data.slot
  );
  if (checks.attestationRecorded) {
    const status = await connection.getSignatureStatus(data.attestation_signature, {
      searchTransactionHistory: true
    });
    checks.attestationFinalized = Boolean(
      status.value && !status.value.err && status.value.confirmationStatus === "finalized"
    );
  }
  return {
    verified: Object.values(checks).every(Boolean),
    findingId,
    address: address.toBase58(),
    checks
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [apiUrl, findingId, rpcUrl, programId] = process.argv.slice(2);
  if (!apiUrl || !findingId || !rpcUrl || !programId) {
    process.stderr.write(
      "Usage: verifier <api-url> <finding-id> <rpc-url> <registry-program-id>\n"
    );
    process.exitCode = 2;
  } else {
    verifyRemote({ apiUrl, findingId, rpcUrl, programId })
      .then((result) => {
        process.stdout.write(`${JSON.stringify(result)}\n`);
        if (!result.verified) process.exitCode = 1;
      })
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      });
  }
}
