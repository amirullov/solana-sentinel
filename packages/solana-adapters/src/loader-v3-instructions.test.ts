import { describe, expect, it } from "vitest";
import {
  LOADER_V3_INSTRUCTION_TAGS,
  parseLoaderV3Instructions,
  type TransactionInstructionInput
} from "./loader-v3-instructions.js";
import { UPGRADEABLE_LOADER_PROGRAM_ID } from "./loader-v3.js";

const programData = "BPFLoaderUpgradeab1e11111111111111111111111";
const program = "Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4";

function instructionData(tag: number): Uint8Array {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(tag);
  return data;
}

function transaction(tag: number, accounts: number[]): TransactionInstructionInput {
  return {
    signature: "5".repeat(64),
    slot: 42,
    accountKeys: [UPGRADEABLE_LOADER_PROGRAM_ID.toBase58(), programData, program],
    instructions: [{ programIdIndex: 0, accounts, data: instructionData(tag) }]
  };
}

describe("loader-v3 instruction parser", () => {
  it("decodes Upgrade account roles", () => {
    const facts = parseLoaderV3Instructions(
      transaction(LOADER_V3_INSTRUCTION_TAGS.UPGRADE, [1, 2]),
      new Map([[programData, program]])
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      type: "PROGRAM_UPGRADED",
      programDataAddress: programData,
      programAddress: program
    });
  });

  it("ignores upgrades of unrelated programs even in a watched transaction", () => {
    const input = transaction(LOADER_V3_INSTRUCTION_TAGS.UPGRADE, [1, 2]);
    expect(parseLoaderV3Instructions(input, new Map())).toEqual([]);
    expect(
      parseLoaderV3Instructions(
        input,
        new Map([[programData, UPGRADEABLE_LOADER_PROGRAM_ID.toBase58()]])
      )
    ).toEqual([]);
  });

  it("only reports authority changes for known ProgramData accounts", () => {
    const input = transaction(LOADER_V3_INSTRUCTION_TAGS.SET_AUTHORITY, [1]);
    expect(parseLoaderV3Instructions(input, new Map())).toEqual([]);
    expect(parseLoaderV3Instructions(input, new Map([[programData, program]]))[0]?.type).toBe(
      "UPGRADE_AUTHORITY_CHANGED"
    );
  });
});
