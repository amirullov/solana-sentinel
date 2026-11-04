import { PublicKey } from "@solana/web3.js";

export const REGISTRY_PROGRAM_ID = new PublicKey("Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4");

export function eventIdToBytes(eventId: string): Buffer {
  if (!/^[a-f0-9]{64}$/.test(eventId)) throw new Error("eventId must be 32-byte lowercase hex");
  return Buffer.from(eventId, "hex");
}

export function findFindingAddress(
  eventId: string,
  programId: PublicKey = REGISTRY_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("finding"), eventIdToBytes(eventId)],
    programId
  );
}
