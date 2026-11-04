import { createHash } from "node:crypto";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface EvidenceBundle {
  readonly schema: "solana-sentinel/evidence/v1";
  readonly eventId: string;
  readonly facts: JsonValue;
  readonly sources: readonly JsonValue[];
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Evidence cannot contain non-finite numbers");
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const record = value as { readonly [key: string]: JsonValue };
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key] as JsonValue)}`)
    .join(",")}}`;
}

export function canonicalJson(value: JsonValue): string {
  return canonicalize(value);
}

export function hashEvidence(bundle: EvidenceBundle): string {
  const value: JsonValue = {
    schema: bundle.schema,
    eventId: bundle.eventId,
    facts: bundle.facts,
    sources: bundle.sources
  };
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
