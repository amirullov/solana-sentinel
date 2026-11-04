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
  for (const migration of migrations) {
    await client.query(await readFile(resolve(directory, migration), "utf8"));
    process.stdout.write(`applied ${migration}\n`);
  }
} finally {
  await client.end();
}
