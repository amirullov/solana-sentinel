import { createHash } from "node:crypto";
import { z } from "zod";

export const SECURITY_EVENT_TYPES = [
  "PROGRAM_UPGRADED",
  "UPGRADE_AUTHORITY_CHANGED",
  "WATCHED_ACCOUNT_CHANGED"
] as const;

export const SecurityEventTypeSchema = z.enum(SECURITY_EVENT_TYPES);
export type SecurityEventType = z.infer<typeof SecurityEventTypeSchema>;

export const SolanaClusterSchema = z.enum(["localnet", "devnet", "testnet", "mainnet-beta"]);
export type SolanaCluster = z.infer<typeof SolanaClusterSchema>;

export const CommitmentSchema = z.enum(["processed", "confirmed", "finalized"]);
export type Commitment = z.infer<typeof CommitmentSchema>;

export const ChainEventSchema = z.object({
  eventId: z.string().regex(/^[a-f0-9]{64}$/),
  type: SecurityEventTypeSchema,
  cluster: SolanaClusterSchema,
  targetAddress: z.string().min(32).max(44),
  programAddress: z.string().min(32).max(44).optional(),
  signature: z.string().min(64).max(88),
  slot: z.number().int().nonnegative().safe(),
  commitment: CommitmentSchema,
  observedAt: z.string().datetime(),
  beforeHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  afterHash: z.string().regex(/^[a-f0-9]{64}$/)
});

export type ChainEvent = z.infer<typeof ChainEventSchema>;

export interface EventIdentityInput {
  readonly cluster: SolanaCluster;
  readonly targetAddress: string;
  readonly signature: string;
  readonly type: SecurityEventType;
}

const EVENT_ID_DOMAIN = "solana-sentinel:event-id:v1";

export function createEventId(input: EventIdentityInput): string {
  const canonical = [
    EVENT_ID_DOMAIN,
    input.cluster,
    input.targetAddress,
    input.signature,
    input.type
  ].join("\u0000");

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function parseChainEvent(value: unknown): ChainEvent {
  return ChainEventSchema.parse(value);
}
