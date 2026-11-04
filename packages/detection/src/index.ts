import {
  createFindingId,
  FindingSchema,
  type ChainEvent,
  type Finding,
  type Severity
} from "@sentinel/core";
import { hashEvidence, type EvidenceBundle, type JsonValue } from "@sentinel/evidence";

interface RuleDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly severity: Severity;
}

const RULES: Record<ChainEvent["type"], RuleDefinition> = {
  PROGRAM_UPGRADED: {
    id: "loader-v3-program-upgraded",
    version: 1,
    title: "Upgradeable program code changed",
    severity: "medium"
  },
  UPGRADE_AUTHORITY_CHANGED: {
    id: "loader-v3-authority-changed",
    version: 1,
    title: "Program upgrade authority changed",
    severity: "high"
  },
  WATCHED_ACCOUNT_CHANGED: {
    id: "watched-account-changed",
    version: 1,
    title: "Watched account data changed",
    severity: "info"
  }
};

export function detectFinding(event: ChainEvent): Finding {
  const rule = RULES[event.type];
  const facts: Record<string, JsonValue> = {
    cluster: event.cluster,
    targetAddress: event.targetAddress,
    signature: event.signature,
    slot: event.slot,
    commitment: event.commitment,
    sourceHash: event.sourceHash
  };
  if (event.programAddress) facts.programAddress = event.programAddress;
  if (event.beforeHash) facts.beforeHash = event.beforeHash;
  if (event.afterHash) facts.afterHash = event.afterHash;

  const evidence: EvidenceBundle = {
    schema: "solana-sentinel/evidence/v1",
    eventId: event.eventId,
    facts,
    sources: [
      {
        kind: "solana-transaction",
        cluster: event.cluster,
        signature: event.signature,
        slot: event.slot
      }
    ]
  };

  return FindingSchema.parse({
    findingId: createFindingId(event.eventId, rule.id, rule.version),
    eventId: event.eventId,
    ruleId: rule.id,
    ruleVersion: rule.version,
    severity: rule.severity,
    title: rule.title,
    evidenceHash: hashEvidence(evidence),
    evidence,
    createdAt: event.observedAt
  });
}
