import { describe, expect, it, vi } from "vitest";
import type { DatabaseService, RedisService } from "@square/kernel";
import { ConversationController } from "../src/conversation.controller";

function testController() {
  const database = {
    pool: {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    },
    transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) =>
      work({
        query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      }),
    ),
  } as unknown as DatabaseService;
  const redis = {
    client: {
      hincrby: vi.fn(async () => 1),
    },
  } as unknown as RedisService;
  return new ConversationController(database, redis);
}

describe("ConversationController", () => {
  it("rejects empty chat messages", async () => {
    const controller = testController();
    await expect(controller.sendChat("asset-1", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never, { body: "   " })).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
  });

  it("rejects oversized chat messages", async () => {
    const controller = testController();
    await expect(controller.sendChat("asset-1", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never, { body: "x".repeat(2001) })).rejects.toMatchObject({
      status: 400,
      code: "message_too_long",
    });
  });
});
