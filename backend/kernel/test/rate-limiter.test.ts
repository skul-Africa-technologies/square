import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { RedisRateLimiter } from "../src/rate-limiter";

describe("RedisRateLimiter", () => {
  it("sends the configured token bucket parameters to Redis atomically", async () => {
    const evalScript = vi.fn().mockResolvedValue([1, 4, 0]);
    const limiter = new RedisRateLimiter({ eval: evalScript } as unknown as Redis);

    await expect(
      limiter.consume("messages", "user-1:asset-1", { limit: 5, windowMs: 10_000 }),
    ).resolves.toEqual({ allowed: true, limit: 5, remaining: 4, retryAfterMs: 0 });
    expect(evalScript).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('TIME')"),
      1,
      "rl:messages:user-1:asset-1",
      5,
      0.0005,
      1,
      20_000,
    );
  });

  it("rejects invalid limiter parameters before calling Redis", async () => {
    const evalScript = vi.fn();
    const limiter = new RedisRateLimiter({ eval: evalScript } as unknown as Redis);

    await expect(limiter.consume("messages", "user-1", { limit: 0, windowMs: 1000 })).rejects.toThrow(
      "Invalid rate-limit configuration",
    );
    expect(evalScript).not.toHaveBeenCalled();
  });
});
