import bs58 from "bs58";
import { loadConfig } from "@sentinel/config";
import { InMemoryEventRepository, PostgresEventRepository } from "@sentinel/database";
import { normalizeRpcTransaction, parseLoaderV3Instructions } from "@sentinel/solana-adapters";
import { Connection } from "@solana/web3.js";
import { discoverWatchTargets } from "./discovery.js";
import { saveLoaderFact } from "./reconciliation.js";

async function main(): Promise<void> {
  const signature = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!signature || bs58.decode(signature).length !== 64) {
    throw new Error("Usage: pnpm --filter @sentinel/indexer import:signature SIGNATURE");
  }
  const config = loadConfig();
  if (config.PUBLISHER_ENABLED) {
    throw new Error("Historical import requires publication to be disabled");
  }
  const connection = new Connection(config.SOLANA_RPC_URL, "finalized");
  const discovery = await discoverWatchTargets(connection, config.WATCHED_PROGRAM_IDS, []);
  const response = await connection.getTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0
  });
  if (!response || response.meta?.err) {
    throw new Error("Finalized source transaction is unavailable or failed");
  }
  const facts = parseLoaderV3Instructions(
    normalizeRpcTransaction(signature, response),
    discovery.programByProgramData
  );
  if (facts.length === 0) {
    throw new Error("Transaction has no loader-v3 change for configured watched programs");
  }
  const observedAt = response.blockTime
    ? new Date(response.blockTime * 1000).toISOString()
    : new Date().toISOString();
  if (dryRun) {
    const repository = new InMemoryEventRepository();
    for (const fact of facts) {
      await saveLoaderFact(fact, config.SOLANA_CLUSTER, observedAt, repository);
    }
    process.stdout.write(
      `${JSON.stringify({ signature, cluster: config.SOLANA_CLUSTER, dryRun: true, facts, events: [...repository.events.values()], findings: [...repository.findings.values()] })}\n`
    );
    return;
  }
  const repository = new PostgresEventRepository({ connectionString: config.DATABASE_URL });
  try {
    const results = [];
    for (const fact of facts) {
      const status = await saveLoaderFact(fact, config.SOLANA_CLUSTER, observedAt, repository);
      results.push({
        type: fact.type,
        programAddress: fact.programAddress,
        slot: fact.slot,
        instructionIndex: fact.instructionIndex,
        sourceHash: fact.sourceHash,
        status
      });
    }
    process.stdout.write(
      `${JSON.stringify({ signature, cluster: config.SOLANA_CLUSTER, historicalImport: true, results })}\n`
    );
  } finally {
    await repository.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
