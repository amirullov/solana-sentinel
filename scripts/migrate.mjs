import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://sentinel:sentinel@localhost:5432/sentinel";
const directory = resolve("infra/migrations");
const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const migration of migrations) {
    const version = migration.replace(/\.sql$/, "");
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [
      version
    ]);
    if (applied.rowCount === 1) {
      process.stdout.write(`skipped ${migration}\n`);
      continue;
    }
    await client.query(await readFile(resolve(directory, migration), "utf8"));
    process.stdout.write(`applied ${migration}\n`);
  }
} finally {
  await client.end();
}
