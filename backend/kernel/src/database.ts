import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { Kysely, PostgresDialect } from "kysely";
import { Pool, PoolClient, QueryResult } from "pg";
import type { BackendConfig } from "./config";

export type Database = Record<string, never>;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly pool: Pool;
  readonly kysely: Kysely<Database>;

  constructor(config: BackendConfig) {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: config.DB_POOL_MAX,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 10_000,
      statement_timeout: 5_000,
      idle_in_transaction_session_timeout: 10_000,
      application_name: "square-gateway",
      allowExitOnIdle: true,
    });
    this.kysely = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: this.pool }),
    });
  }

  async probe(): Promise<QueryResult> {
    const result = await this.pool.query<{ migrations: string | null }>(
      "SELECT to_regclass('kernel.schema_migrations')::text AS migrations",
    );
    if (!result.rows[0]?.migrations) throw new Error("Backend database migrations are not applied");
    return result;
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.kysely.destroy();
  }
}
