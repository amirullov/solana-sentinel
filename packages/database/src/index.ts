import type { ChainEvent, Finding, SolanaCluster } from "@sentinel/core";
import { Pool, type PoolConfig } from "pg";

export interface AccountSnapshot {
  readonly cluster: SolanaCluster;
  readonly address: string;
  readonly slot: number;
  readonly dataHash: string;
  readonly dataBase64?: string;
  readonly signature?: string;
  readonly commitment: "processed" | "confirmed" | "finalized";
}

export interface IngestionCheckpoint {
  readonly sourceId: string;
  readonly cluster: SolanaCluster;
  readonly finalizedSlot: number;
  readonly cursorSignature?: string;
  readonly observedFinalizedSlot?: number;
}

export type ServiceState = "starting" | "healthy" | "degraded" | "stopped";

export interface ServiceStatus {
  readonly serviceId: string;
  readonly state: ServiceState;
  readonly details?: Record<string, unknown>;
}

export interface EventRepository {
  save(event: ChainEvent): Promise<"inserted" | "duplicate">;
  saveDetected(event: ChainEvent, finding: Finding): Promise<"inserted" | "duplicate">;
  getLatestSnapshot(
    cluster: SolanaCluster,
    address: string,
    beforeSlot?: number
  ): Promise<AccountSnapshot | undefined>;
  saveSnapshot(snapshot: AccountSnapshot): Promise<void>;
  getCheckpoint(sourceId: string): Promise<IngestionCheckpoint | undefined>;
  advanceCheckpoint(checkpoint: IngestionCheckpoint): Promise<void>;
  updateServiceStatus(status: ServiceStatus): Promise<void>;
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
         commitment, observed_at, source_hash, before_hash, after_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        event.sourceHash,
        event.beforeHash ?? null,
        event.afterHash ?? null
      ]
    );
    return result.rowCount === 1 ? "inserted" : "duplicate";
  }

  async saveDetected(event: ChainEvent, finding: Finding): Promise<"inserted" | "duplicate"> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const eventResult = await client.query(
        `INSERT INTO chain_events
          (event_id, event_type, cluster, target_address, program_address, signature, slot,
           commitment, observed_at, source_hash, before_hash, after_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
          event.sourceHash,
          event.beforeHash ?? null,
          event.afterHash ?? null
        ]
      );
      if (eventResult.rowCount !== 1) {
        await client.query("ROLLBACK");
        return "duplicate";
      }
      await client.query(
        `INSERT INTO findings
          (finding_id, event_id, rule_id, rule_version, severity, title, evidence_hash, evidence, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [
          finding.findingId,
          finding.eventId,
          finding.ruleId,
          finding.ruleVersion,
          finding.severity,
          finding.title,
          finding.evidenceHash,
          JSON.stringify(finding.evidence),
          finding.createdAt
        ]
      );
      await client.query(
        `INSERT INTO notification_outbox (finding_id, destination_id, payload)
         SELECT $1::uuid, d.destination_id,
                jsonb_build_object(
                  'schema', 'solana-sentinel/webhook/v1',
                  'findingId', $1::text,
                  'eventId', $2::text,
                  'ruleId', $3::text,
                  'ruleVersion', $4::integer,
                  'severity', $5::text,
                  'title', $6::text,
                  'evidenceHash', $7::text,
                  'cluster', $8::text,
                  'targetAddress', $9::text,
                  'signature', $10::text,
                  'slot', $11::bigint,
                  'eventType', $12::text
                )
         FROM webhook_destinations d
         WHERE d.enabled
         ON CONFLICT (finding_id, destination_id) DO NOTHING`,
        [
          finding.findingId,
          finding.eventId,
          finding.ruleId,
          finding.ruleVersion,
          finding.severity,
          finding.title,
          finding.evidenceHash,
          event.cluster,
          event.targetAddress,
          event.signature,
          event.slot,
          event.type
        ]
      );
      await client.query("COMMIT");
      return "inserted";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestSnapshot(
    cluster: SolanaCluster,
    address: string,
    beforeSlot?: number
  ): Promise<AccountSnapshot | undefined> {
    const result = await this.#pool.query<{
      cluster: SolanaCluster;
      address: string;
      slot: string;
      data_hash: string;
      data_base64: string | null;
      signature: string | null;
      commitment: "processed" | "confirmed" | "finalized";
    }>(
      `SELECT cluster, address, slot::text, data_hash, data_base64, signature, commitment
       FROM account_snapshots
       WHERE cluster = $1 AND address = $2 AND ($3::bigint IS NULL OR slot < $3::bigint)
       ORDER BY slot DESC, snapshot_id DESC LIMIT 1`,
      [cluster, address, beforeSlot ?? null]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      cluster: row.cluster,
      address: row.address,
      slot: Number(row.slot),
      dataHash: row.data_hash,
      ...(row.data_base64 ? { dataBase64: row.data_base64 } : {}),
      ...(row.signature ? { signature: row.signature } : {}),
      commitment: row.commitment
    };
  }

  async saveSnapshot(snapshot: AccountSnapshot): Promise<void> {
    await this.#pool.query(
      `INSERT INTO account_snapshots
        (cluster, address, slot, data_hash, data_base64, signature, commitment)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (cluster, address, slot, data_hash) DO NOTHING`,
      [
        snapshot.cluster,
        snapshot.address,
        snapshot.slot,
        snapshot.dataHash,
        snapshot.dataBase64 ?? null,
        snapshot.signature ?? null,
        snapshot.commitment
      ]
    );
  }

  async getCheckpoint(sourceId: string): Promise<IngestionCheckpoint | undefined> {
    const result = await this.#pool.query<{
      source_id: string;
      cluster: SolanaCluster;
      finalized_slot: string;
      cursor_signature: string | null;
      observed_finalized_slot: string | null;
    }>(
      `SELECT source_id, cluster, finalized_slot::text, cursor_signature,
              observed_finalized_slot::text
       FROM ingestion_checkpoints WHERE source_id = $1`,
      [sourceId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      sourceId: row.source_id,
      cluster: row.cluster,
      finalizedSlot: Number(row.finalized_slot),
      ...(row.cursor_signature ? { cursorSignature: row.cursor_signature } : {}),
      ...(row.observed_finalized_slot
        ? { observedFinalizedSlot: Number(row.observed_finalized_slot) }
        : {})
    };
  }

  async advanceCheckpoint(checkpoint: IngestionCheckpoint): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ingestion_checkpoints
        (source_id, cluster, finalized_slot, cursor_signature, observed_finalized_slot, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (source_id) DO UPDATE SET
         finalized_slot = EXCLUDED.finalized_slot,
         cursor_signature = EXCLUDED.cursor_signature,
         observed_finalized_slot = EXCLUDED.observed_finalized_slot,
         updated_at = now()
       WHERE EXCLUDED.finalized_slot >= ingestion_checkpoints.finalized_slot`,
      [
        checkpoint.sourceId,
        checkpoint.cluster,
        checkpoint.finalizedSlot,
        checkpoint.cursorSignature ?? null,
        checkpoint.observedFinalizedSlot ?? null
      ]
    );
  }

  async updateServiceStatus(status: ServiceStatus): Promise<void> {
    await this.#pool.query(
      `INSERT INTO service_status (service_id, state, details, heartbeat_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (service_id) DO UPDATE SET
         state = EXCLUDED.state,
         details = EXCLUDED.details,
         heartbeat_at = EXCLUDED.heartbeat_at`,
      [status.serviceId, status.state, JSON.stringify(status.details ?? {})]
    );
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}

export class InMemoryEventRepository implements EventRepository {
  readonly events = new Map<string, ChainEvent>();
  readonly findings = new Map<string, Finding>();
  readonly snapshots = new Map<string, AccountSnapshot[]>();
  readonly checkpoints = new Map<string, IngestionCheckpoint>();
  readonly serviceStatuses = new Map<string, ServiceStatus>();

  save(event: ChainEvent): Promise<"inserted" | "duplicate"> {
    if (this.events.has(event.eventId)) return Promise.resolve("duplicate");
    this.events.set(event.eventId, event);
    return Promise.resolve("inserted");
  }

  async saveDetected(event: ChainEvent, finding: Finding): Promise<"inserted" | "duplicate"> {
    const status = await this.save(event);
    if (status === "inserted") this.findings.set(finding.findingId, finding);
    return status;
  }

  getLatestSnapshot(
    cluster: SolanaCluster,
    address: string,
    beforeSlot?: number
  ): Promise<AccountSnapshot | undefined> {
    const snapshots = this.snapshots.get(`${cluster}:${address}`) ?? [];
    return Promise.resolve(
      snapshots
        .filter((snapshot) => beforeSlot === undefined || snapshot.slot < beforeSlot)
        .toSorted((a, b) => b.slot - a.slot)[0]
    );
  }

  saveSnapshot(snapshot: AccountSnapshot): Promise<void> {
    const key = `${snapshot.cluster}:${snapshot.address}`;
    const snapshots = this.snapshots.get(key) ?? [];
    if (
      !snapshots.some((item) => item.slot === snapshot.slot && item.dataHash === snapshot.dataHash)
    ) {
      snapshots.push(snapshot);
      this.snapshots.set(key, snapshots);
    }
    return Promise.resolve();
  }

  getCheckpoint(sourceId: string): Promise<IngestionCheckpoint | undefined> {
    return Promise.resolve(this.checkpoints.get(sourceId));
  }

  advanceCheckpoint(checkpoint: IngestionCheckpoint): Promise<void> {
    const current = this.checkpoints.get(checkpoint.sourceId);
    if (!current || checkpoint.finalizedSlot >= current.finalizedSlot) {
      this.checkpoints.set(checkpoint.sourceId, checkpoint);
    }
    return Promise.resolve();
  }

  updateServiceStatus(status: ServiceStatus): Promise<void> {
    this.serviceStatuses.set(status.serviceId, status);
    return Promise.resolve();
  }
}
