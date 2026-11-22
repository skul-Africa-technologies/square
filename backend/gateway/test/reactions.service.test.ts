import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, DatabaseService, RedisRateLimiter } from "@square/kernel";
import { ReactionsService } from "../src/reactions.service";

const user: AuthenticatedUser = {
  id: "user-1",
  sessionId: "session-1",
  trustLevel: 1,
  sessionVersion: 1,
};

function serviceWithQuery(handler: (sql: string, values?: unknown[]) => unknown) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      queries.push(sql);
      return handler(sql, values) ?? { rows: [], rowCount: 0 };
    }),
  };
  const database = {
    transaction: (work: (transactionClient: typeof client) => Promise<unknown>) => work(client),
    pool: {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        queries.push(sql);
        return handler(sql, values) ?? { rows: [], rowCount: 0 };
      }),
    },
  };
  const limiter = { consume: vi.fn().mockResolvedValue({ allowed: true }) };
  return {
    service: new ReactionsService(database as unknown as DatabaseService, limiter as unknown as RedisRateLimiter),
    queries,
    client,
  };
}

function assetContext(deletedAt: Date | null = null) {
  return {
    asset_id: "asset-1",
    community_id: "community-1",
    deleted_at: deletedAt,
    is_public: true,
    can_read_roles: ["owner", "moderator", "member"],
    can_post_roles: ["owner", "moderator", "member"],
    role: "member",
  };
}

describe("ReactionsService", () => {
  it("rejects emoji outside the RGI allowlist before accessing dependencies", async () => {
    const { service, queries, client } = serviceWithQuery(() => undefined);

    await expect(service.toggle("asset", "message-1", "❤", user, true)).rejects.toMatchObject({
      status: 400,
      code: "emoji_not_allowed",
    });
    expect(queries).toHaveLength(0);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects a tombstoned message before mutating reaction rows", async () => {
    const { service, queries } = serviceWithQuery(sql => {
      if (sql.includes("FROM chat.messages message")) return { rows: [assetContext(new Date())], rowCount: 1 };
      return undefined;
    });

    await expect(service.toggle("asset", "message-1", "👍", user, true)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(queries.some(sql => sql.includes("INSERT INTO chat.reactions"))).toBe(false);
  });

  it("enforces the per-user reaction limit", async () => {
    const { service, queries } = serviceWithQuery(sql => {
      if (sql.includes("FROM chat.messages message")) return { rows: [assetContext()], rowCount: 1 };
      if (sql.startsWith("SELECT 1 FROM chat.reactions WHERE")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM chat.reaction_counts WHERE message_id = $1")) {
        return { rows: [{ count: "3" }], rowCount: 1 };
      }
      if (sql.includes("count(*)::text AS count FROM chat.reactions")) return { rows: [{ count: "10" }], rowCount: 1 };
      return undefined;
    });

    await expect(service.toggle("asset", "message-1", "👍", user, true)).rejects.toMatchObject({
      status: 409,
      code: "reaction_limit_reached",
    });
    expect(queries.some(sql => sql.includes("INSERT INTO chat.reactions"))).toBe(false);
  });

  it("rejects blocked DM participants", async () => {
    const { service, queries } = serviceWithQuery(sql => {
      if (sql.includes("FROM dm.messages message")) {
        return { rows: [{ conversation_id: "dm-1", deleted_at: null }], rowCount: 1 };
      }
      if (sql.includes("FROM dm.participants peer")) {
        return { rows: [{ participant: true, blocked: true, participant_count: "2" }], rowCount: 1 };
      }
      return undefined;
    });

    await expect(service.toggle("dm", "message-1", "👍", user, true)).rejects.toMatchObject({
      status: 403,
      code: "dm_blocked",
    });
    expect(queries.some(sql => sql.includes("INSERT INTO dm.reactions"))).toBe(false);
  });

  it("allows an existing emoji at the distinct-emoji cap but rejects a new 21st emoji", async () => {
    const make = (emojiExists: boolean) => serviceWithQuery(sql => {
      if (sql.includes("FROM chat.messages message")) return { rows: [assetContext()], rowCount: 1 };
      if (sql.startsWith("SELECT 1 FROM chat.reactions WHERE")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM chat.reaction_counts WHERE message_id = $1")) {
        if (sql.includes("emoji = $2")) return { rows: emojiExists ? [{ "?column?": 1 }] : [], rowCount: Number(emojiExists) };
        return { rows: [{ count: "20" }], rowCount: 1 };
      }
      if (sql.includes("count(*)::text AS count FROM chat.reactions")) return { rows: [{ count: "0" }], rowCount: 1 };
      if (sql.startsWith("INSERT INTO chat.reactions")) return { rows: [{ "?column?": 1 }], rowCount: 1 };
      if (sql.includes("INSERT INTO chat.reaction_counts")) return { rows: [{ count: 21 }], rowCount: 1 };
      return undefined;
    });

    const existing = make(true);
    await expect(existing.service.toggle("asset", "message-1", "👍", user, true)).resolves.toBeUndefined();
    expect(existing.queries.some(sql => sql.includes("INSERT INTO chat.reactions"))).toBe(true);

    const fresh = make(false);
    await expect(fresh.service.toggle("asset", "message-1", "🔥", user, true)).rejects.toMatchObject({
      status: 409,
      code: "reaction_limit_reached",
    });
    expect(fresh.queries.some(sql => sql.includes("INSERT INTO chat.reactions"))).toBe(false);
  });

  it("hydrates a message page with two indexed lookups and preserves count order", async () => {
    const { service, queries } = serviceWithQuery(sql => {
      if (sql.includes("FROM chat.reaction_counts")) {
        return {
          rows: [
            { message_id: "m1", emoji: "👍", count: 4 },
            { message_id: "m1", emoji: "🔥", count: 2 },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes("FROM chat.reactions")) return { rows: [{ message_id: "m1", emoji: "🔥" }], rowCount: 1 };
      return undefined;
    });

    const result = await service.hydrateMessageReactions("asset", ["m1", "m2"], user.id);
    expect(result.get("m1")).toEqual([
      { emoji: "👍", count: 4, me: false },
      { emoji: "🔥", count: 2, me: true },
    ]);
    expect(result.get("m2")).toEqual([]);
    expect(queries).toHaveLength(2);
    expect(queries.every(sql => !/GROUP BY/i.test(sql))).toBe(true);
  });
});
