import { resolve } from "node:path";
import { InMemoryEventRepository, PostgresEventRepository } from "@sentinel/database";
import { loadConfig } from "@sentinel/config";
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
  await repository.close();
  throw new Error(
    "Live correlation is intentionally gated in the foundation release. Use --replay; Yellowstone and RPC correlation lands in milestone 1."
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
