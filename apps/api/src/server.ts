import Fastify, { type FastifyInstance } from "fastify";
import { Pool } from "pg";

export interface ServerOptions {
  readonly databaseUrl: string;
  readonly version?: string;
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
              slot::text, commitment, observed_at, before_hash, after_hash
       FROM chain_events ORDER BY slot DESC LIMIT 100`
    );
    return { data: result.rows };
  });
  app.addHook("onClose", async () => pool.end());
  return app;
}
