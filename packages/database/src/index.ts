import type { ChainEvent } from "@sentinel/core";
import { Pool, type PoolConfig } from "pg";

export interface EventRepository {
  save(event: ChainEvent): Promise<"inserted" | "duplicate">;
}

export class PostgresEventRepository implements EventRepository {
  readonly #pool: Pool;

  constructor(config: PoolConfig | Pool) {
    this.#pool = config instanceof Pool ? config : new Pool(config);
  }

  async save(event: ChainEvent): Promise<"inserted" | "duplicate"> {
    const result = await this.#pool.query(
      `INSERT INTO chain_events
        (event_id, event_type, cluster, target_address, program_address, signature, slot,
         commitment, observed_at, before_hash, after_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        event.type,
        event.cluster,
        event.targetAddress,
        event.programAddress ?? null,
        event.signature,
        event.slot,
        event.commitment,
        event.observedAt,
        event.beforeHash ?? null,
        event.afterHash
      ]
    );
    return result.rowCount === 1 ? "inserted" : "duplicate";
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}

export class InMemoryEventRepository implements EventRepository {
  readonly events = new Map<string, ChainEvent>();

  save(event: ChainEvent): Promise<"inserted" | "duplicate"> {
    if (this.events.has(event.eventId)) return Promise.resolve("duplicate");
    this.events.set(event.eventId, event);
    return Promise.resolve("inserted");
  }
}
