import { config as loadDotEnv } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { parseBackendConfig } from "@square/kernel";

async function migrate(): Promise<void> {
  loadDotEnv({ path: resolve(__dirname, "../../../.env"), quiet: true });
  const config = parseBackendConfig(process.env);
  const pool = new Pool({
    connectionString: config.DIRECT_URL ?? config.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    application_name: "square-migrations",
  });
  const migrationsPath = resolve(__dirname, "../../db/migrations");

  try {
    await pool.query("CREATE SCHEMA IF NOT EXISTS kernel");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kernel.schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const migrations = (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort();

    for (const name of migrations) {
      const applied = await pool.query("SELECT 1 FROM kernel.schema_migrations WHERE name = $1", [name]);
      if (applied.rowCount) continue;

      const sql = await readFile(resolve(migrationsPath, name), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO kernel.schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        process.stdout.write(`applied ${name}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    process.stdout.write("database migrations complete\n");
  } finally {
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  process.stderr.write(`database migration failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
