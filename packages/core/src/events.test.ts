import { describe, expect, it } from "vitest";
import { createEventId } from "./events.js";

const identity = {
  cluster: "devnet" as const,
  targetAddress: "Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4",
  signature: "5".repeat(64),
  type: "PROGRAM_UPGRADED" as const
};

describe("createEventId", () => {
  it("is deterministic and domain separated", () => {
    expect(createEventId(identity)).toBe(createEventId({ ...identity }));
    expect(createEventId(identity)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when an identity field changes", () => {
    expect(createEventId(identity)).not.toBe(
      createEventId({ ...identity, type: "UPGRADE_AUTHORITY_CHANGED" })
    );
  });
});
