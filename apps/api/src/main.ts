import { loadConfig } from "@sentinel/config";
import { buildServer } from "./server.js";

const config = loadConfig();
const server = buildServer({ databaseUrl: config.DATABASE_URL, version: "0.1.0" });

void server.listen({ host: config.API_HOST, port: config.API_PORT }).catch((error: unknown) => {
  server.log.error(error);
  process.exitCode = 1;
});
