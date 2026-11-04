import Fastify, { type FastifyInstance } from "fastify";
import { Pool } from "pg";

export interface ServerOptions {
  readonly databaseUrl: string;
  readonly version?: string;
}

interface FindingEvidenceRow {
  finding_id: string;
  event_id: string;
  evidence_hash: string;
  evidence: unknown;
  attestation_signature: string | null;
  registry_program_id: string | null;
  verified_at: Date | null;
}

interface StatusRow {
  source_id: string;
  cluster: string;
  finalized_slot: string;
  observed_finalized_slot: string | null;
  lag_slots: string;
  cursor_signature: string | null;
  updated_at: Date;
}

interface LatestEventRow {
  slot: string | null;
  inserted_at: Date | null;
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  const pool = new Pool({ connectionString: options.databaseUrl, max: 10 });

  app.get("/health/live", () => ({ status: "ok", version: options.version ?? "dev" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready", database: "ok" };
    } catch {
      return reply.status(503).send({ status: "not-ready", database: "unavailable" });
    }
  });
  app.get("/v1/events", async () => {
    const result = await pool.query(
      `SELECT event_id, event_type, cluster, target_address, program_address, signature,
              slot::text, commitment, observed_at, source_hash, before_hash, after_hash
       FROM chain_events ORDER BY slot DESC LIMIT 100`
    );
    return { data: result.rows };
  });
  app.get("/v1/findings", async () => {
    const result = await pool.query(
      `SELECT f.finding_id, f.event_id, f.rule_id, f.rule_version, f.severity, f.title,
              f.evidence_hash, f.created_at, e.event_type, e.cluster, e.target_address,
              e.program_address, e.signature, e.slot::text, e.commitment
       FROM findings f JOIN chain_events e ON e.event_id = f.event_id
       ORDER BY e.slot DESC LIMIT 100`
    );
    return { data: result.rows };
  });
  app.get<{ Params: { findingId: string } }>(
    "/v1/findings/:findingId/evidence",
    async (request, reply) => {
      const result = await pool.query<FindingEvidenceRow>(
        `SELECT f.finding_id, f.event_id, f.evidence_hash, f.evidence,
                a.transaction_signature AS attestation_signature,
                a.registry_program_id, a.verified_at
         FROM findings f LEFT JOIN attestations a ON a.finding_id = f.finding_id
         WHERE f.finding_id = $1`,
        [request.params.findingId]
      );
      const finding = result.rows[0];
      if (!finding) return reply.status(404).send({ error: "finding_not_found" });
      return { data: finding };
    }
  );
  app.get("/v1/status", async () => {
    const result = await pool.query<StatusRow>(
      `SELECT source_id, cluster, finalized_slot::text, observed_finalized_slot::text,
              GREATEST(COALESCE(observed_finalized_slot, finalized_slot) - finalized_slot, 0)::text AS lag_slots,
              cursor_signature, updated_at
       FROM ingestion_checkpoints ORDER BY source_id`
    );
    const latestEvent = await pool.query<LatestEventRow>(
      "SELECT max(slot)::text AS slot, max(inserted_at) AS inserted_at FROM chain_events"
    );
    const staleBefore = Date.now() - 2 * 60 * 1000;
    const degraded = result.rows.some(
      (row) => Number(row.lag_slots) > 64 || row.updated_at.getTime() < staleBefore
    );
    return {
      state: result.rows.length === 0 ? "not-configured" : degraded ? "degraded" : "operational",
      checkpoints: result.rows,
      latestEvent: latestEvent.rows[0] ?? null,
      claims: { mainnetDeployed: false, verifiedBuild: false }
    };
  });
  app.addHook("onClose", async () => pool.end());
  return app;
}
