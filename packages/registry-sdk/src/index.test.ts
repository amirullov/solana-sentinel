import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildPublishFindingInstruction,
  decodeRegistryAccount,
  eventIdToBytes,
  findFindingAddress
} from "./index.js";

describe("registry SDK", () => {
  it("derives finding PDAs deterministically", () => {
    const id = "a".repeat(64);
    expect(findFindingAddress(id)).toEqual(findFindingAddress(id));
    expect(eventIdToBytes(id)).toHaveLength(32);
  });

  it("encodes the Anchor publish_finding instruction", () => {
    const publisher = new PublicKey("Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4");
    const instruction = buildPublishFindingInstruction(
      {
        eventId: "a".repeat(64),
        cluster: "devnet",
        kind: "PROGRAM_UPGRADED",
        target: publisher,
        slot: 42n,
        evidenceHash: "b".repeat(64),
        transactionSignature: new Uint8Array(64)
      },
      publisher
    );
    expect(instruction.keys).toHaveLength(4);
    expect(instruction.data).toHaveLength(178);
  });

  it("decodes RegistryConfig and rejects another account type", () => {
    const admin = new PublicKey("11111111111111111111111111111111");
    const publisher = new PublicKey("Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4");
    const discriminator = createHash("sha256")
      .update("account:RegistryConfig")
      .digest()
      .subarray(0, 8);
    const data = Buffer.concat([
      discriminator,
      Buffer.from([1, 0]),
      Buffer.from([254]),
      admin.toBuffer(),
      publisher.toBuffer()
    ]);
    expect(decodeRegistryAccount(data)).toMatchObject({ schemaVersion: 1, bump: 254 });
    expect(decodeRegistryAccount(data).publisher.equals(publisher)).toBe(true);
    expect(() => decodeRegistryAccount(Buffer.alloc(75))).toThrow("Invalid RegistryConfig");
  });
});
