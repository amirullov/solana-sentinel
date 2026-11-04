import { PublicKey, type Connection } from "@solana/web3.js";
import {
  decodeUpgradeableLoaderState,
  UPGRADEABLE_LOADER_PROGRAM_ID
} from "@sentinel/solana-adapters";

export interface WatchTarget {
  readonly address: string;
  readonly loader: "loader-v3" | "watched-account";
  readonly programAddress?: string;
}

export interface DiscoveryResult {
  readonly targets: ReadonlyMap<string, WatchTarget>;
  readonly programByProgramData: ReadonlyMap<string, string>;
}

export async function discoverWatchTargets(
  connection: Connection,
  programIds: readonly string[],
  watchedAccounts: readonly string[]
): Promise<DiscoveryResult> {
  const targets = new Map<string, WatchTarget>();
  const programByProgramData = new Map<string, string>();
  for (const address of watchedAccounts) {
    const publicKey = new PublicKey(address);
    targets.set(publicKey.toBase58(), { address: publicKey.toBase58(), loader: "watched-account" });
  }

  if (programIds.length === 0) return { targets, programByProgramData };
  const publicKeys = programIds.map((address) => new PublicKey(address));
  const accounts = await connection.getMultipleAccountsInfo(publicKeys, "finalized");
  accounts.forEach((account, index) => {
    const programAddress = publicKeys[index]?.toBase58();
    if (!programAddress) return;
    if (!account) throw new Error(`Watched program does not exist: ${programAddress}`);
    if (!account.owner.equals(UPGRADEABLE_LOADER_PROGRAM_ID)) {
      throw new Error(`Watched program is not owned by loader-v3: ${programAddress}`);
    }
    const state = decodeUpgradeableLoaderState(account.data);
    if (state.kind !== "program") {
      throw new Error(`Watched address is not a loader-v3 Program account: ${programAddress}`);
    }
    programByProgramData.set(state.programDataAddress, programAddress);
    targets.set(state.programDataAddress, {
      address: state.programDataAddress,
      loader: "loader-v3",
      programAddress
    });
  });
  return { targets, programByProgramData };
}
