import { describe, expect, it, vi } from "vitest";
import type { DatabaseService, RedisRateLimiter } from "@square/kernel";
import { ModerationController } from "../src/moderation.controller";

function makeController(allowed = true) {
  const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
  const database = {
    pool: { query },
    transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) =>
      work({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })) }),
    ),
  } as unknown as DatabaseService;
  const rateLimiter = {
    consume: vi.fn(async () => ({ allowed, limit: 5, remaining: 0, retryAfterMs: 60_000 })),
  } as unknown as RedisRateLimiter;
  return { controller: new ModerationController(database, rateLimiter), query, rateLimiter };
}

const request = {
  user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
} as never;

describe("ModerationController", () => {
  it("rate-limits report submissions before target lookups", async () => {
    const { controller, query, rateLimiter } = makeController(false);

    await expect(controller.createReport(request, {
      targetKind: "post",
      targetId: "post-1",
      reason: "spam",
    })).rejects.toMatchObject({ status: 429, code: "rate_limited" });

    expect(rateLimiter.consume).toHaveBeenCalledWith(
      "moderation:report",
      "user-1",
      { limit: 5, windowMs: 3_600_000 },
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("does not expose reports to non-moderators", async () => {
    const { controller } = makeController();

    await expect(controller.listReports("club", request)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });
});
