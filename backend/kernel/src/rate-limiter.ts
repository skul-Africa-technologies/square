import Redis from "ioredis";

const TOKEN_BUCKET_SCRIPT = `
local now = redis.call('TIME')
local now_ms = (tonumber(now[1]) * 1000) + math.floor(tonumber(now[2]) / 1000)
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])
local values = redis.call('HMGET', KEYS[1], 'tokens', 'at')
local tokens = tonumber(values[1]) or capacity
local last = tonumber(values[2]) or now_ms
tokens = math.min(capacity, tokens + math.max(0, now_ms - last) * refill_per_ms)
local allowed = 0
local retry_ms = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry_ms = math.ceil((cost - tokens) / refill_per_ms)
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'at', now_ms)
redis.call('PEXPIRE', KEYS[1], ttl_ms)
return {allowed, math.floor(tokens), retry_ms}
`;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
}

export class RedisRateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(
    family: string,
    key: string,
    options: { limit: number; windowMs: number; cost?: number },
  ): Promise<RateLimitResult> {
    const cost = options.cost ?? 1;
    if (!/^[a-z0-9:_-]{1,80}$/i.test(family) || key.length < 1 || key.length > 256) {
      throw new Error("Invalid rate-limit key");
    }
    if (!Number.isInteger(options.limit) || options.limit < 1 || !Number.isInteger(options.windowMs) || options.windowMs < 1) {
      throw new Error("Invalid rate-limit configuration");
    }
    if (!Number.isFinite(cost) || cost <= 0 || cost > options.limit) {
      throw new Error("Invalid rate-limit cost");
    }

    const result = await this.redis.eval(
      TOKEN_BUCKET_SCRIPT,
      1,
      `rl:${family}:${key}`,
      options.limit,
      options.limit / options.windowMs,
      cost,
      options.windowMs * 2,
    );
    if (!Array.isArray(result) || result.length !== 3) throw new Error("Unexpected rate-limit response");
    const [allowed, remaining, retryAfterMs] = result.map(Number);
    if (![allowed, remaining, retryAfterMs].every(Number.isFinite)) throw new Error("Unexpected rate-limit response");

    return {
      allowed: allowed === 1,
      limit: options.limit,
      remaining,
      retryAfterMs,
    };
  }
}
