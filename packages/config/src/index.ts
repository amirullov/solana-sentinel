import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { z } from "zod";

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());
const publicKeyList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  );

export const RuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.url().default("postgres://sentinel:sentinel@localhost:5432/sentinel"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  YELLOWSTONE_ENDPOINT: optionalUrl,
  YELLOWSTONE_X_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional()
  ),
  SOLANA_RPC_URL: z.url().default("https://api.devnet.solana.com"),
  SOLANA_SECONDARY_RPC_URL: optionalUrl,
  SOLANA_CLUSTER: z.enum(["localnet", "devnet", "testnet", "mainnet-beta"]).default("devnet"),
  WATCHED_PROGRAM_IDS: publicKeyList,
  WATCHED_ACCOUNT_IDS: publicKeyList,
  RPC_BACKFILL_MAX_SIGNATURES: z.coerce.number().int().min(1).max(10_000).default(1000),
  WEBHOOK_SIGNING_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional()
  ),
  PUBLISHER_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLISHER_CONFIRM_PROGRAM_DEPLOYED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLISHER_KEYPAIR_PATH: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional()
  ),
  SENTINEL_REGISTRY_PROGRAM_ID: z.string().default("BZ3PWjMS6g4bkPjr66h5Vb4e2qHyj3To2EDzTT9j5yY6")
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  if (environment === process.env) {
    const envFile = new URL("../../../.env", import.meta.url);
    if (existsSync(envFile)) loadEnvFile(envFile);
  }
  const config = RuntimeConfigSchema.parse(environment);
  if (config.PUBLISHER_ENABLED && !config.PUBLISHER_KEYPAIR_PATH) {
    throw new Error("PUBLISHER_KEYPAIR_PATH is required when publication is enabled");
  }
  if (config.PUBLISHER_ENABLED && !config.PUBLISHER_CONFIRM_PROGRAM_DEPLOYED) {
    throw new Error("PUBLISHER_CONFIRM_PROGRAM_DEPLOYED=true is required to enable publication");
  }
  return config;
}
