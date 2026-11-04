import { z } from "zod";

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

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
  SOLANA_CLUSTER: z.enum(["localnet", "devnet", "testnet", "mainnet-beta"]).default("devnet"),
  PUBLISHER_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLISHER_KEYPAIR_PATH: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional()
  )
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const config = RuntimeConfigSchema.parse(environment);
  if (config.PUBLISHER_ENABLED && !config.PUBLISHER_KEYPAIR_PATH) {
    throw new Error("PUBLISHER_KEYPAIR_PATH is required when publication is enabled");
  }
  return config;
}
