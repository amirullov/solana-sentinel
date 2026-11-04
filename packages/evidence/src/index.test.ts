import { describe, expect, it } from "vitest";
import { canonicalJson, hashEvidence, type EvidenceBundle } from "./index.js";

describe("canonical evidence", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: true, b: null } })).toBe(
      '{"a":{"b":null,"y":true},"z":1}'
    );
  });

  it("produces the same hash for semantically identical key order", () => {
    const left: EvidenceBundle = {
      schema: "solana-sentinel/evidence/v1",
      eventId: "a".repeat(64),
      facts: { slot: 42, authority: "abc" },
      sources: []
    };
    const right: EvidenceBundle = { ...left, facts: { authority: "abc", slot: 42 } };
    expect(hashEvidence(left)).toBe(hashEvidence(right));
  });
});
