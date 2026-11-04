import type { ChainEvent } from "@sentinel/core";
import { describe, expect, it } from "vitest";
import { detectFinding } from "./index.js";

const event: ChainEvent = {
  eventId: "a".repeat(64),
  type: "UPGRADE_AUTHORITY_CHANGED",
  cluster: "devnet",
  targetAddress: "Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4",
  signature: "5".repeat(64),
  slot: 42,
  commitment: "finalized",
  observedAt: "2026-11-04T00:00:00.000Z",
  sourceHash: "b".repeat(64),
  afterHash: "c".repeat(64)
};

describe("detectFinding", () => {
  it("maps a chain fact to a deterministic evidence-backed finding", () => {
    const finding = detectFinding(event);
    expect(finding.severity).toBe("high");
    expect(finding.ruleId).toBe("loader-v3-authority-changed");
    expect(finding.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(detectFinding(event).findingId).toBe(finding.findingId);
  });
});
