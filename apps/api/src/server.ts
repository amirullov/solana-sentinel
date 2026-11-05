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
  event_type: string;
  cluster: string;
  target_address: string;
  signature: string;
  slot: string;
  commitment: string;
  attestation_signature: string | null;
  registry_program_id: string | null;
  verified_at: Date | null;
}

interface StatusRow {
  source_id: string;
  cluster: string;
  finalized_slot: string;
  observed_finalized_slot: string | null;
  lag_slots: string | null;
  cursor_signature: string | null;
  updated_at: Date;
}

interface ServiceStatusRow {
  service_id: string;
  state: "starting" | "healthy" | "degraded" | "stopped";
  heartbeat_at: Date;
}

interface LatestEventRow {
  slot: string | null;
  inserted_at: Date | null;
}

export function assessIndexerStatus(
  checkpoints: readonly StatusRow[],
  services: readonly ServiceStatusRow[],
  now = Date.now()
): { readonly state: "not-configured" | "degraded" | "operational"; readonly issues: string[] } {
  const staleBefore = now - 2 * 60 * 1000;
  const indexer = services.find((row) => row.service_id === "indexer");
  const issues: string[] = [];
  if (!indexer || indexer.heartbeat_at.getTime() < staleBefore) {
    issues.push("indexer_heartbeat_missing_or_stale");
  } else if (indexer.state !== "healthy") {
    issues.push(`indexer_${indexer.state}`);
  }
  const liveCheckpoints = checkpoints.filter((row) => row.source_id.startsWith("yellowstone:"));
  const freshnessCheckpoints = liveCheckpoints.length > 0 ? liveCheckpoints : checkpoints;
  if (
    freshnessCheckpoints.some(
      (row) =>
        row.lag_slots === null ||
        Number(row.lag_slots) > 64 ||
        row.updated_at.getTime() < staleBefore
    )
  ) {
    issues.push("checkpoint_missing_observation_or_stale");
  }
  return {
    state:
      checkpoints.length === 0 ? "not-configured" : issues.length > 0 ? "degraded" : "operational",
    issues
  };
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
    {
      schema: {
        params: {
          type: "object",
          required: ["findingId"],
          properties: {
            findingId: {
              type: "string",
              pattern:
                "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          }
        }
      }
    },
    async (request, reply) => {
      const result = await pool.query<FindingEvidenceRow>(
        `SELECT f.finding_id, f.event_id, f.evidence_hash, f.evidence,
                e.event_type, e.cluster, e.target_address, e.signature,
                e.slot::text, e.commitment,
                a.transaction_signature AS attestation_signature,
                a.registry_program_id, a.verified_at
         FROM findings f JOIN chain_events e ON e.event_id = f.event_id
         LEFT JOIN attestations a ON a.finding_id = f.finding_id
         WHERE f.finding_id = $1`,
        [request.params.findingId]
      );
      const finding = result.rows[0];
      if (!finding) return reply.status(404).send({ error: "finding_not_found" });
      return { data: finding };
    }
  );
  app.get("/v1/status", async () => {
    const [checkpoints, latestEvent, services] = await Promise.all([
      pool.query<StatusRow>(
        `SELECT source_id, cluster, finalized_slot::text, observed_finalized_slot::text,
              CASE WHEN observed_finalized_slot IS NULL THEN NULL
                   ELSE GREATEST(observed_finalized_slot - finalized_slot, 0)::text END AS lag_slots,
              cursor_signature, updated_at
       FROM ingestion_checkpoints ORDER BY source_id`
      ),
      pool.query<LatestEventRow>(
        "SELECT max(slot)::text AS slot, max(inserted_at) AS inserted_at FROM chain_events"
      ),
      pool.query<ServiceStatusRow>(
        "SELECT service_id, state, heartbeat_at FROM service_status ORDER BY service_id"
      )
    ]);
    const assessment = assessIndexerStatus(checkpoints.rows, services.rows);
    return {
      ...assessment,
      checkpoints: checkpoints.rows,
      services: services.rows,
      latestEvent: latestEvent.rows[0] ?? null,
      claims: { mainnetDeployed: false, verifiedBuild: false }
    };
  });
  app.addHook("onClose", async () => pool.end());
  return app;
}
