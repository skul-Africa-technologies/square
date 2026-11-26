import { Injectable } from "@nestjs/common";
import { PoolClient } from "pg";
import type Redis from "ioredis";
import { DatabaseService } from "./database";
import { RedisService } from "./redis";

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  version: number;
  timestamp: string;
  actor: string;
  traceId?: string;
  data: T;
}

export async function insertOutboxEvent<T>(
  client: PoolClient,
  event: DomainEvent<T>,
): Promise<void> {
  await client.query(
    `INSERT INTO kernel.outbox (id, type, version, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [event.id, event.type, event.version, JSON.stringify(event)],
  );
  await client.query("SELECT pg_notify('kernel_outbox', $1)", [event.id]);
}

@Injectable()
export class OutboxRelay {
  constructor(
    private readonly database: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  async publishBatch(limit = 100): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid outbox batch size");
    const redis: Redis = this.redisService.client;

    const rows = await this.database.pool.query<{ id: string; type: string; payload: DomainEvent }>(
      `SELECT id, type, payload
       FROM kernel.outbox
       WHERE published_at IS NULL
       ORDER BY created_at, id
       LIMIT $1`,
      [limit],
    );
    if (rows.rowCount === 0) return 0;

    for (const row of rows.rows) {
      await redis.xadd(`evt:${row.type}`, "MAXLEN", "~", "100000", "*", "id", row.id, "payload", JSON.stringify(row.payload));
    }

    const ids = rows.rows.map((row) => row.id);
    await this.database.pool.query(
      `UPDATE kernel.outbox SET published_at = now()
       WHERE id = ANY($1::text[]) AND published_at IS NULL`,
      [ids],
    );
    return ids.length;
  }
}

export class EventConsumer {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: Redis,
  ) {}

  async ensureGroup(stream: string, group: string): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) throw error;
    }
  }

  async process(
    stream: string,
    group: string,
    messageId: string,
    event: DomainEvent,
    handler: (client: PoolClient, event: DomainEvent) => Promise<void>,
  ): Promise<boolean> {
    const processed = await this.database.transaction(async (client) => {
      const receipt = await client.query(
        `INSERT INTO kernel.consumer_receipts (consumer, event_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING event_id`,
        [group, event.id],
      );
      if (receipt.rowCount === 0) return false;
      await handler(client, event);
      return true;
    });
    await this.redis.xack(stream, group, messageId);
    return processed;
  }
}
