import { resolve } from "node:path";
import { InMemoryEventRepository, PostgresEventRepository } from "@sentinel/database";
import { loadConfig } from "@sentinel/config";
import { Connection } from "@solana/web3.js";
import { discoverWatchTargets } from "./discovery.js";
import { reconcileLoaderV3 } from "./reconciliation.js";
import { replayFile } from "./replay.js";

async function main(): Promise<void> {
  const replayIndex = process.argv.indexOf("--replay");
  if (replayIndex >= 0) {
    const path = process.argv[replayIndex + 1];
    if (!path) throw new Error("--replay requires a JSON fixture path");
    const repository = new InMemoryEventRepository();
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
    const summary = await replayFile(resolve(invocationDirectory, path), repository);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return;
  }

  const config = loadConfig();
  const repository = new PostgresEventRepository({ connectionString: config.DATABASE_URL });
  try {
    const connection = new Connection(config.SOLANA_RPC_URL, "finalized");
    const discovery = await discoverWatchTargets(
      connection,
      config.WATCHED_PROGRAM_IDS,
      config.WATCHED_ACCOUNT_IDS
    );
    if (discovery.targets.size === 0) {
      throw new Error("Configure at least one WATCHED_PROGRAM_IDS or WATCHED_ACCOUNT_IDS value");
    }
    const summary = await reconcileLoaderV3(
      connection,
      discovery.programByProgramData,
      repository,
      { cluster: config.SOLANA_CLUSTER, maxSignatures: config.RPC_BACKFILL_MAX_SIGNATURES }
    );
    process.stdout.write(`${JSON.stringify({ reconciliation: summary })}\n`);
    if (process.argv.includes("--reconcile")) return;
    if (!config.YELLOWSTONE_ENDPOINT) {
      throw new Error(
        "YELLOWSTONE_ENDPOINT is required for live mode; use --reconcile for RPC-only recovery"
      );
    }
    const checkpoints = await Promise.all(
      [...discovery.programByProgramData.keys()].map((address) =>
        repository.getCheckpoint(`rpc:${config.SOLANA_CLUSTER}:${address}`)
      )
    );
    const fromSlot = checkpoints
      .map((checkpoint) => checkpoint?.finalizedSlot)
      .filter((slot): slot is number => slot !== undefined)
      .sort((left, right) => left - right)[0];
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const { runLiveIngestion } = await import("./live.js");
    await runLiveIngestion(
      {
        endpoint: config.YELLOWSTONE_ENDPOINT,
        ...(config.YELLOWSTONE_X_TOKEN ? { token: config.YELLOWSTONE_X_TOKEN } : {}),
        cluster: config.SOLANA_CLUSTER,
        targets: discovery.targets,
        programByProgramData: discovery.programByProgramData,
        ...(fromSlot !== undefined ? { fromSlot } : {})
      },
      repository,
      controller.signal
    );
  } finally {
    await repository.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
