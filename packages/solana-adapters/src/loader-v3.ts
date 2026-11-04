import { PublicKey } from "@solana/web3.js";

export const UPGRADEABLE_LOADER_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);
export const PROGRAMDATA_METADATA_SIZE = 45;

export type UpgradeableLoaderState =
  | { readonly kind: "uninitialized" }
  | { readonly kind: "buffer"; readonly authority: string | null }
  | { readonly kind: "program"; readonly programDataAddress: string }
  | {
      readonly kind: "programData";
      readonly slot: bigint;
      readonly upgradeAuthority: string | null;
      readonly bytecode: Uint8Array;
    };

function readOptionPubkey(data: Buffer, offset: number): string | null {
  const option = data.readUInt8(offset);
  if (option === 0) return null;
  if (option !== 1 || data.length < offset + 33) throw new Error("Invalid optional pubkey");
  return new PublicKey(data.subarray(offset + 1, offset + 33)).toBase58();
}

export function decodeUpgradeableLoaderState(bytes: Uint8Array): UpgradeableLoaderState {
  const data = Buffer.from(bytes);
  if (data.length < 4) throw new Error("Upgradeable loader account is shorter than discriminant");

  const tag = data.readUInt32LE(0);
  switch (tag) {
    case 0:
      return { kind: "uninitialized" };
    case 1:
      if (data.length < 5) throw new Error("Buffer account is truncated");
      return { kind: "buffer", authority: readOptionPubkey(data, 4) };
    case 2:
      if (data.length < 36) throw new Error("Program account is truncated");
      return {
        kind: "program",
        programDataAddress: new PublicKey(data.subarray(4, 36)).toBase58()
      };
    case 3:
      if (data.length < 13) throw new Error("ProgramData account is truncated");
      return {
        kind: "programData",
        slot: data.readBigUInt64LE(4),
        upgradeAuthority: readOptionPubkey(data, 12),
        bytecode: Uint8Array.from(
          data.subarray(data.readUInt8(12) === 0 ? 13 : PROGRAMDATA_METADATA_SIZE)
        )
      };
    default:
      throw new Error(`Unknown upgradeable loader state tag: ${tag}`);
  }
}
