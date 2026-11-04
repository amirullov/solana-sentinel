import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeUpgradeableLoaderState, PROGRAMDATA_METADATA_SIZE } from "./loader-v3.js";

describe("loader-v3 decoder", () => {
  it("decodes a Program account", () => {
    const key = new PublicKey("Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4");
    const data = Buffer.alloc(36);
    data.writeUInt32LE(2, 0);
    key.toBuffer().copy(data, 4);
    expect(decodeUpgradeableLoaderState(data)).toEqual({
      kind: "program",
      programDataAddress: key.toBase58()
    });
  });

  it("decodes ProgramData metadata and bytecode", () => {
    const authority = new PublicKey("Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4");
    const data = Buffer.alloc(PROGRAMDATA_METADATA_SIZE + 3);
    data.writeUInt32LE(3, 0);
    data.writeBigUInt64LE(123n, 4);
    data.writeUInt8(1, 12);
    authority.toBuffer().copy(data, 13);
    data.set([1, 2, 3], PROGRAMDATA_METADATA_SIZE);
    expect(decodeUpgradeableLoaderState(data)).toEqual({
      kind: "programData",
      slot: 123n,
      upgradeAuthority: authority.toBase58(),
      bytecode: new Uint8Array([1, 2, 3])
    });
  });
});
