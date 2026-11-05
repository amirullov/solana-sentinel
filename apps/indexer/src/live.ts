import type { SolanaCluster } from "@sentinel/core";
import type { EventRepository } from "@sentinel/database";
import {
  parseLoaderV3Instructions,
  publicKeysFromBytes,
  UPGRADEABLE_LOADER_PROGRAM_ID,
  type LoaderV3InstructionFact,
  type TransactionInstructionInput
} from "@sentinel/solana-adapters";
import bs58 from "bs58";
import Client, {
  CommitmentLevel,
  type ClientReconnectDuplexStream,
  type ReconnectEvent,
  type SubscribeRequest,
  type SubscribeUpdate,
  type SubscribeUpdateAccount
} from "@triton-one/yellowstone-grpc";
import type { WatchTarget } from "./discovery.js";
import { processObservation } from "./pipeline.js";
import { saveLoaderFact } from "./reconciliation.js";

export interface LiveIngestionOptions {
  readonly endpoint: string;
  readonly token?: string;
  readonly cluster: SolanaCluster;
  readonly targets: ReadonlyMap<string, WatchTarget>;
  readonly programByProgramData: ReadonlyMap<string, string>;
  readonly fromSlot?: number;
}

interface PendingAccount {
  readonly update: SubscribeUpdateAccount;
  readonly observedAt: string;
}

class LiveCorrelator {
  readonly #facts = new Map<string, LoaderV3InstructionFact[]>();
  readonly #pending = new Map<string, PendingAccount[]>();
  readonly #handledFacts = new Set<string>();

  constructor(
    private readonly options: LiveIngestionOptions,
    private readonly repository: EventRepository
  ) {}

  async transaction(update: NonNullable<SubscribeUpdate["transaction"]>, observedAt: string) {
    const info = update.transaction;
    const message = info?.transaction?.message;
    if (!info || !message || info.meta?.err) return;
    const signature = bs58.encode(info.signature);
    const input: TransactionInstructionInput = {
      signature,
      slot: Number(update.slot),
      accountKeys: publicKeysFromBytes([
        ...message.accountKeys,
        ...(info.meta?.loadedWritableAddresses ?? []),
        ...(info.meta?.loadedReadonlyAddresses ?? [])
      ]),
      instructions: message.instructions.map((instruction) => ({
        programIdIndex: instruction.programIdIndex,
        accounts: Array.from(instruction.accounts),
        data: instruction.data
      }))
    };
    const facts = parseLoaderV3Instructions(input, this.options.programByProgramData);
    this.#facts.set(signature, facts);
    const pending = this.#pending.get(signature) ?? [];
    this.#pending.delete(signature);
    for (const account of pending) await this.#processAccount(account, facts);
    if (pending.length === 0 && facts.length === 0) return;
    // Facts without a matching account write are committed when the finalized slot is flushed.
    void observedAt;
  }

  async account(update: SubscribeUpdateAccount, observedAt: string) {
    const info = update.account;
    if (!info?.txnSignature) return;
    const address = bs58.encode(info.pubkey);
    const target = this.options.targets.get(address);
    if (!target) return;
    const signature = bs58.encode(info.txnSignature);
    if (target.loader === "watched-account") {
      await this.#processAccount({ update, observedAt }, this.#facts.get(signature) ?? []);
      return;
    }
    const facts = this.#facts.get(signature);
    if (facts) {
      await this.#processAccount({ update, observedAt }, facts);
      return;
    }
    const pending = this.#pending.get(signature) ?? [];
    pending.push({ update, observedAt });
    this.#pending.set(signature, pending);
  }

  async flushThrough(slot: number, observedAt: string) {
    for (const [signature, accounts] of this.#pending) {
      const ready = accounts.filter((account) => Number(account.update.slot) <= slot);
      if (ready.length === 0) continue;
      this.#pending.delete(signature);
      for (const account of ready) await this.#processAccount(account, []);
    }
    for (const [signature, facts] of this.#facts) {
      for (const fact of facts) {
        const key = `${signature}:${fact.instructionIndex}`;
        if (fact.slot <= slot && !this.#handledFacts.has(key)) {
          await saveLoaderFact(fact, this.options.cluster, observedAt, this.repository);
          this.#handledFacts.add(key);
        }
      }
      if (facts.every((fact) => fact.slot <= slot)) this.#facts.delete(signature);
    }
  }

  async #processAccount(account: PendingAccount, facts: readonly LoaderV3InstructionFact[]) {
    const info = account.update.account;
    if (!info?.txnSignature) return;
    const address = bs58.encode(info.pubkey);
    const target = this.options.targets.get(address);
    if (!target) return;
    const signature = bs58.encode(info.txnSignature);
    const matchingFacts = facts.filter((fact) => fact.programDataAddress === address);
    const hints = matchingFacts.length > 0 ? matchingFacts : [undefined];
    for (const fact of hints) {
      await processObservation(
        {
          cluster: this.options.cluster,
          address,
          ...(target.programAddress ? { programAddress: target.programAddress } : {}),
          signature,
          slot: Number(account.update.slot),
          commitment: "finalized",
          observedAt: account.observedAt,
          loader: target.loader,
          ...(fact ? { eventTypeHint: fact.type, sourceHashHint: fact.sourceHash } : {}),
          afterBase64: Buffer.from(info.data).toString("base64")
        },
        this.repository
      );
      if (fact) this.#handledFacts.add(`${signature}:${fact.instructionIndex}`);
    }
  }
}

export async function runLiveIngestion(
  options: LiveIngestionOptions,
  repository: EventRepository,
  signal: AbortSignal
): Promise<void> {
  const ClientConstructor = Client as unknown as new (
    endpoint: string,
    token: string | undefined,
    channelOptions: undefined,
    reconnectOptions: {
      policy: "Replay";
      slotsBehind: number;
      backoff: { initialIntervalMs: number; multiplier: number; maxRetries: number };
    }
  ) => {
    connect(): Promise<void>;
    subscribeWithReconnect(request: SubscribeRequest): Promise<ClientReconnectDuplexStream>;
  };
  const client = new ClientConstructor(options.endpoint, options.token, undefined, {
    policy: "Replay",
    slotsBehind: 32,
    backoff: { initialIntervalMs: 250, multiplier: 2, maxRetries: 20 }
  });
  await client.connect();
  const loaderTargets = [...options.programByProgramData.keys()];
  const request: SubscribeRequest = {
    accounts: {
      watched: {
        account: [...options.targets.keys()],
        owner: [],
        filters: [],
        nonemptyTxnSignature: true
      }
    },
    slots: { finalized: { filterByCommitment: true, interslotUpdates: false } },
    transactions:
      loaderTargets.length > 0
        ? {
            loaderV3: {
              vote: false,
              failed: false,
              accountInclude: loaderTargets,
              accountExclude: [],
              accountRequired: [UPGRADEABLE_LOADER_PROGRAM_ID.toBase58()]
            }
          }
        : {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    blockFooter: {},
    commitment: CommitmentLevel.FINALIZED,
    accountsDataSlice: [],
    ...(options.fromSlot !== undefined ? { fromSlot: String(options.fromSlot) } : {})
  };
  const stream = await client.subscribeWithReconnect(request);
  const correlator = new LiveCorrelator(options, repository);

  await new Promise<void>((resolve, reject) => {
    let queue = Promise.resolve();
    const abort = () => stream.destroy();
    signal.addEventListener("abort", abort, { once: true });
    stream.on("data", (event: ReconnectEvent) => {
      if (event.type === "Disconnected") return;
      const update = event.update;
      const observedAt = update.createdAt?.toISOString() ?? new Date().toISOString();
      queue = queue
        .then(async () => {
          if (update.transaction) await correlator.transaction(update.transaction, observedAt);
          if (update.account) await correlator.account(update.account, observedAt);
          if (update.slot) {
            const slot = Number(update.slot.slot);
            await correlator.flushThrough(slot, observedAt);
            await repository.advanceCheckpoint({
              sourceId: `yellowstone:${options.cluster}`,
              cluster: options.cluster,
              finalizedSlot: slot,
              observedFinalizedSlot: slot
            });
            await repository.updateServiceStatus({
              serviceId: "indexer",
              state: "healthy",
              details: { cluster: options.cluster, finalizedSlot: slot }
            });
          }
        })
        .catch(reject);
    });
    stream.once("error", reject);
    stream.once("close", () => {
      signal.removeEventListener("abort", abort);
      void queue.then(resolve, reject);
    });
  });
}
