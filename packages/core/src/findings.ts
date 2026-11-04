import { createHash } from "node:crypto";
import { z } from "zod";

export const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingSchema = z.object({
  findingId: z.uuid(),
  eventId: z.string().regex(/^[a-f0-9]{64}$/),
  ruleId: z.string().min(1).max(128),
  ruleVersion: z.number().int().positive(),
  severity: SeveritySchema,
  title: z.string().min(1).max(256),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidence: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});

export type Finding = z.infer<typeof FindingSchema>;

export function createFindingId(eventId: string, ruleId: string, ruleVersion: number): string {
  const hash = createHash("sha256")
    .update(`solana-sentinel:finding-id:v1\0${eventId}\0${ruleId}\0${ruleVersion}`)
    .digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
