import { describe, expect, it } from "vitest";
import { createFindingId, FindingSchema } from "./findings.js";

describe("finding identity", () => {
  it("creates a deterministic UUIDv5-shaped identifier", () => {
    const eventId = "a".repeat(64);
    const id = createFindingId(eventId, "loader-v3-upgrade", 1);
    expect(id).toBe(createFindingId(eventId, "loader-v3-upgrade", 1));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(() =>
      FindingSchema.parse({
        findingId: id,
        eventId,
        ruleId: "loader-v3-upgrade",
        ruleVersion: 1,
        severity: "medium",
        title: "Program upgraded",
        evidenceHash: "b".repeat(64),
        evidence: {},
        createdAt: "2026-11-04T00:00:00.000Z"
      })
    ).not.toThrow();
  });
});
