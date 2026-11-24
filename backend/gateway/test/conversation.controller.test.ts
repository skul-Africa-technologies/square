import { describe, expect, it, vi } from "vitest";
import type { BackendConfig, DatabaseService, RedisService } from "@square/kernel";
import { ConversationController } from "../src/conversation.controller";

function testController(config: Pick<BackendConfig, "DM_ENABLED"> = { DM_ENABLED: true }) {
  const query = vi.fn(async (..._args: unknown[]) => ({
    rows: [] as Record<string, unknown>[],
    rowCount: 0,
  }));
  const transactionQuery = vi.fn(async (..._args: unknown[]) => ({
    rows: [] as Record<string, unknown>[],
    rowCount: 0,
  }));
  const database = {
    pool: {
      query,
    },
    transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) =>
      work({
        query: transactionQuery,
      }),
    ),
  } as unknown as DatabaseService;
  const redis = {
    client: {
      hincrby: vi.fn(async () => 1),
    },
  } as unknown as RedisService;
  return { controller: new ConversationController(database, redis, config), query, transactionQuery };
}

describe("ConversationController", () => {
  it("rejects empty chat messages", async () => {
    const { controller } = testController();
    await expect(controller.sendChat("asset-1", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never, { body: "   " })).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
  });

  it("rejects oversized chat messages", async () => {
    const { controller } = testController();
    await expect(controller.sendChat("asset-1", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never, { body: "x".repeat(2001) })).rejects.toMatchObject({
      status: 400,
      code: "message_too_long",
    });
  });

  it("uses the latest chat sequence when the frontend omits a read cursor", async () => {
    const { controller, query } = testController();
    query
      .mockResolvedValueOnce({ rows: [{ latest_seq: 8 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await controller.markAssetRead("asset-1", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never, undefined);

    expect(query.mock.calls[1][1]).toEqual(["asset-1", "user-1", 8]);
  });

  it("rejects direct-message access when the feature is disabled", async () => {
    const { controller } = testController({ DM_ENABLED: false });
    await expect(controller.dmList({
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never)).rejects.toMatchObject({ status: 403, code: "dm_closed" });
  });
});
