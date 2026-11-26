import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseBackendConfig } from "../src/config";
import { DatabaseService } from "../src/database";
import { EventConsumer, insertOutboxEvent, OutboxRelay } from "../src/outbox";
import { RedisRateLimiter } from "../src/rate-limiter";
import { RedisService } from "../src/redis";

const enabled = process.env.RUN_BACKEND_INTEGRATION_TESTS === "true";

function firstStreamMessageId(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const firstStream = value[0];
  if (!Array.isArray(firstStream) || !Array.isArray(firstStream[1])) return undefined;
  const firstMessage = firstStream[1][0];
  if (!Array.isArray(firstMessage) || typeof firstMessage[0] !== "string") return undefined;
  return firstMessage[0];
}

describe.skipIf(!enabled)("Postgres and Redis integration", () => {
  let database: DatabaseService;
  let redisService: RedisService;

  beforeAll(async () => {
    const config = parseBackendConfig(process.env);
    database = new DatabaseService(config);
    redisService = new RedisService(config);
    await Promise.all([database.probe(), redisService.probe()]);
    await database.pool.query(`
      CREATE TABLE IF NOT EXISTS kernel.integration_effects (
        event_id text PRIMARY KEY,
        effect_count integer NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await Promise.all([
      database.onApplicationShutdown(),
      redisService.onApplicationShutdown(),
    ]);
  });

  it("applies rate limits atomically in Redis", async () => {
    const limiter = new RedisRateLimiter(redisService.client);
    const key = `integration-${randomUUID()}`;
    try {
      await expect(limiter.consume("integration", key, { limit: 2, windowMs: 60_000 })).resolves.toMatchObject({
        allowed: true,
        remaining: 1,
      });
      await expect(limiter.consume("integration", key, { limit: 2, windowMs: 60_000 })).resolves.toMatchObject({
        allowed: true,
        remaining: 0,
      });
      await expect(limiter.consume("integration", key, { limit: 2, windowMs: 60_000 })).resolves.toMatchObject({
        allowed: false,
        limit: 2,
      });
    } finally {
      await redisService.client.del(`rl:integration:${key}`);
    }
  });

  it("delivers an outbox event and commits consumer effects once across retries", async () => {
    const eventId = randomUUID();
    const eventType = `backend.integration.${randomUUID()}`;
    const stream = `evt:${eventType}`;
    const group = `test-${randomUUID()}`;
    const consumerName = "integration-test";
    const event = {
      id: eventId,
      type: eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actor: "system",
      data: { marker: "phase-0" },
    };
    const relay = new OutboxRelay(database, redisService);
    const consumer = new EventConsumer(database, redisService.client);

    try {
      await database.transaction((client) => insertOutboxEvent(client, event));
      expect(await relay.publishBatch()).toBeGreaterThanOrEqual(1);
      await consumer.ensureGroup(stream, group);
      const entries: unknown = await redisService.client.xreadgroup(
        "GROUP",
        group,
        consumerName,
        "COUNT",
        "1",
        "BLOCK",
        "1000",
        "STREAMS",
        stream,
        ">",
      );
      const messageId = firstStreamMessageId(entries);
      if (!messageId) throw new Error("Outbox event was not delivered to Redis");

      await expect(
        consumer.process(stream, group, messageId, event, async () => {
          throw new Error("simulated consumer crash");
        }),
      ).rejects.toThrow("simulated consumer crash");

      await expect(
        consumer.process(stream, group, messageId, event, async (client) => {
          await client.query(
            `INSERT INTO kernel.integration_effects (event_id, effect_count)
             VALUES ($1, 1)
             ON CONFLICT (event_id) DO UPDATE SET effect_count = kernel.integration_effects.effect_count + 1`,
            [eventId],
          );
        }),
      ).resolves.toBe(true);

      await expect(
        consumer.process(stream, group, messageId, event, async () => {
          throw new Error("duplicate event was applied");
        }),
      ).resolves.toBe(false);
      const result = await database.pool.query<{ effect_count: number }>(
        "SELECT effect_count FROM kernel.integration_effects WHERE event_id = $1",
        [eventId],
      );
      expect(result.rows[0]?.effect_count).toBe(1);
    } finally {
      await database.pool.query("DELETE FROM kernel.integration_effects WHERE event_id = $1", [eventId]);
      await database.pool.query("DELETE FROM kernel.consumer_receipts WHERE consumer = $1", [group]);
      await database.pool.query("DELETE FROM kernel.outbox WHERE id = $1", [eventId]);
      await redisService.client.del(stream);
    }
  });
});
