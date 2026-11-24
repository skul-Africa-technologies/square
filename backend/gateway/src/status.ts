import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { Pool } from "pg";
import { parseBackendConfig } from "@square/kernel";

async function inspectDatabase(label: string, connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5_000,
    application_name: "square-database-status",
  });

  try {
    const schemaResult = await pool.query<{ current_schema: string | null }>(
      "SELECT current_schema() AS current_schema",
    );
    const tableResult = await pool.query<{ schema_name: string; table_name: string }>(
      `SELECT table_schema AS schema_name, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'vault')
       ORDER BY table_schema, table_name`,
    );
    const migrationResult = await pool.query<{ applied: number }>(
      "SELECT count(*)::int AS applied FROM kernel.schema_migrations",
    );
    const institutionDirectoryResult = await pool.query<{ institutions: number; searchable: number }>(
      `SELECT count(*)::int AS institutions,
              count(*) FILTER (
                WHERE EXISTS (
                  SELECT 1 FROM users.school_aliases alias
                  WHERE alias.school_id = school.id
                )
              )::int AS searchable
       FROM users.schools school`,
    );
    const tablesBySchema = new Map<string, string[]>();
    for (const row of tableResult.rows) {
      const tables = tablesBySchema.get(row.schema_name) ?? [];
      tables.push(row.table_name);
      tablesBySchema.set(row.schema_name, tables);
    }

    const currentSchema = schemaResult.rows[0]?.current_schema ?? "none";
    process.stdout.write(`${label}: connected; current schema: ${currentSchema}\n`);
    process.stdout.write(`  migrations applied: ${migrationResult.rows[0]?.applied ?? 0}\n`);
    process.stdout.write(
      `  institution directory: ${institutionDirectoryResult.rows[0]?.institutions ?? 0} institutions; ${institutionDirectoryResult.rows[0]?.searchable ?? 0} with search aliases\n`,
    );
    if (!tablesBySchema.has(currentSchema)) {
      process.stdout.write(`  ${currentSchema}: 0 application tables; application tables are in the schemas below\n`);
    }
    if (tablesBySchema.size === 0) {
      process.stdout.write("  no application tables are visible to this database role\n");
      return;
    }
    for (const [schema, tables] of tablesBySchema) {
      process.stdout.write(`  ${schema} (${tables.length}): ${tables.join(", ")}\n`);
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  loadDotEnv({ path: resolve(__dirname, "../../../.env"), quiet: true });
  const config = parseBackendConfig(process.env);
  const targets: Array<[string, string]> = [["DATABASE_URL", config.DATABASE_URL]];
  if (config.DIRECT_URL) targets.push(["DIRECT_URL", config.DIRECT_URL]);

  let failed = false;
  for (const [label, url] of targets) {
    try {
      await inspectDatabase(label, url);
    } catch (error) {
      failed = true;
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "unknown";
      process.stderr.write(`${label}: database inspection failed (${code})\n`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`database status failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
