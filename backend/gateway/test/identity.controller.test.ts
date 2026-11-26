import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService, RedisRateLimiter, RedisService } from "@square/kernel";
import { parseBackendConfig } from "@square/kernel";
import { IdentityController } from "../src/identity.controller";

describe("IdentityController auth codes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("generates a random six-digit code and stores only its HMAC", async () => {
    const query = vi.fn(async (..._args: unknown[]) => ({
      rows: [] as Record<string, unknown>[],
      rowCount: 1,
    }));
    const set = vi.fn(async (..._args: unknown[]) => "OK");
    const logger = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const database = { pool: { query } } as unknown as DatabaseService;
    const redis = {
      client: {
        set,
        del: vi.fn(async () => 1),
      },
    } as unknown as RedisService;
    const limiter = {
      consume: vi.fn(async () => ({ allowed: true, limit: 5, remaining: 4, retryAfterMs: 0 })),
    } as unknown as RedisRateLimiter;
    const controller = new IdentityController(
      database,
      redis,
      limiter,
      parseBackendConfig({ NODE_ENV: "test", DEV_EXPOSE_AUTH_CODE: "true", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );

    await expect(
      controller.requestCode(
        { email: "student@example.com" },
        { ip: "127.0.0.1" } as never,
      ),
    ).resolves.toEqual({ ok: true });

    const codeCall = set.mock.calls.find(([key]) => String(key).startsWith("auth:code:"));
    expect(codeCall).toBeDefined();
    const stored = JSON.parse(String(codeCall?.[1])) as { hash: string };
    expect(stored.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(String(codeCall?.[1])).not.toContain("123456");
    expect(logger.mock.calls.flat().join(" ")).toMatch(/\d{6}/);
    expect(limiter.consume).toHaveBeenCalledTimes(2);
  });

  it("never returns the verification code in the request-code response", async () => {
    let sentBody: { text?: string; html?: string } | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
      sentBody = JSON.parse(String(init?.body)) as { text?: string; html?: string };
      return { ok: true, status: 200, text: async () => "", json: async () => ({}) } as unknown as Response;
    }));
    const set = vi.fn(async (..._args: unknown[]) => "OK");
    const database = {
      pool: { query: vi.fn(async () => ({ rows: [] as Record<string, unknown>[], rowCount: 1 })) },
    } as unknown as DatabaseService;
    const redis = {
      client: { set, del: vi.fn(async () => 1) },
    } as unknown as RedisService;
    const limiter = {
      consume: vi.fn(async () => ({ allowed: true, limit: 5, remaining: 4, retryAfterMs: 0 })),
    } as unknown as RedisRateLimiter;
    const controller = new IdentityController(
      database,
      redis,
      limiter,
      parseBackendConfig({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square",
        AUTH_CODE_PEPPER: "p".repeat(32),
        RESEND_API_KEY: "re_test_key",
        RESEND_SENDER_EMAIL: "auth@square.app",
      }),
    );

    const response = await controller.requestCode(
      { email: "student@example.com" },
      { ip: "127.0.0.1" } as never,
    );

    expect(response).toEqual({ ok: true });
    const serialized = JSON.stringify(response);
    expect(serialized).not.toMatch(/[0-9]{6}/);
    // The code is delivered by email only, never in the HTTP response.
    const emailedCode = String(sentBody?.text ?? "").match(/[0-9]{6}/)?.[0] ?? "";
    expect(emailedCode).toMatch(/^[0-9]{6}$/);
    expect(serialized).not.toContain(emailedCode);
    expect(sentBody?.html).toContain(emailedCode);
    expect(limiter.consume).toHaveBeenCalledTimes(2);
  });

  it("blocks requests when the email rate limit is exceeded", async () => {
    const set = vi.fn(async () => "OK");
    const database = {
      pool: { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) },
    } as unknown as DatabaseService;
    const redis = { client: { set, del: vi.fn() } } as unknown as RedisService;
    const limiter = {
      consume: vi.fn(async () => ({ allowed: false, limit: 5, remaining: 0, retryAfterMs: 1000 })),
    } as unknown as RedisRateLimiter;
    const controller = new IdentityController(
      database,
      redis,
      limiter,
      parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );

    await expect(
      controller.requestCode(
        { email: "student@example.com" },
        { ip: "127.0.0.1" } as never,
      ),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    expect(limiter.consume).toHaveBeenCalled();
  });

  it("does not consume the rate limit when a delivery cooldown is active", async () => {
    const set = vi.fn(async () => null);
    const database = {
      pool: { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) },
    } as unknown as DatabaseService;
    const redis = { client: { set, del: vi.fn() } } as unknown as RedisService;
    const limiter = {
      consume: vi.fn(async () => ({ allowed: true, limit: 5, remaining: 4, retryAfterMs: 0 })),
    } as unknown as RedisRateLimiter;
    const controller = new IdentityController(
      database,
      redis,
      limiter,
      parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );

    await expect(
      controller.requestCode(
        { email: "student@example.com" },
        { ip: "127.0.0.1" } as never,
      ),
    ).resolves.toEqual({ ok: true });
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it("uses the deterministic code only when explicit test mode is enabled", async () => {
    const logger = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const controller = new IdentityController(
      { pool: { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } } as unknown as DatabaseService,
      { client: { set: vi.fn(async () => "OK"), del: vi.fn(async () => 1) } } as unknown as RedisService,
      { consume: vi.fn(async () => ({ allowed: true, limit: 5, remaining: 4, retryAfterMs: 0 })) } as unknown as RedisRateLimiter,
      parseBackendConfig({ NODE_ENV: "test", AUTH_TEST_MODE: "true", DEV_EXPOSE_AUTH_CODE: "true", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );

    await controller.requestCode(
      { email: "parity@example.com" },
      { ip: "127.0.0.1" } as never,
    );

    expect(logger.mock.calls.flat().join(" ")).toContain("123456");
  });

  it("reports invalid codes and locks further attempts after five failures", async () => {
    let attempts = 0;
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const redis = {
      client: {
        get: vi.fn(async () => null),
        incr: vi.fn(async () => ++attempts),
        expire: vi.fn(async () => 1),
        del: vi.fn(async () => 1),
      },
    } as unknown as RedisService;
    const controller = new IdentityController(
      { pool: { query } } as unknown as DatabaseService,
      redis,
      {} as RedisRateLimiter,
      parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );
    const request = { ip: "127.0.0.1" } as never;
    const reply = { header: vi.fn() } as never;

    await expect(controller.verifyCode(
      { email: "student@example.com", code: "123456" },
      request,
      reply,
    )).rejects.toMatchObject({ status: 400, code: "code_invalid" });

    for (let attempt = 2; attempt < 5; attempt++) {
      await expect(controller.verifyCode(
        { email: "student@example.com", code: "123456" },
        request,
        reply,
      )).rejects.toMatchObject({ status: 400, code: "code_invalid" });
    }

    await expect(controller.verifyCode(
      { email: "student@example.com", code: "123456" },
      request,
      reply,
    )).rejects.toMatchObject({ status: 429, code: "too_many_attempts" });
    expect(attempts).toBe(5);
  });
});

describe("IdentityController blocks", () => {
  it("prevents a user from blocking their own account", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "user-1" }], rowCount: 1 }));
    const database = { pool: { query } } as unknown as DatabaseService;
    const redis = { client: {} } as unknown as RedisService;
    const limiter = { consume: vi.fn() } as unknown as RedisRateLimiter;
    const controller = new IdentityController(
      database,
      redis,
      limiter,
      parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );

    await expect(controller.blockUser({ username: "user-1" }, {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never)).rejects.toMatchObject({ status: 400, code: "validation_failed" });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("IdentityController signup", () => {
  it("does not consume a signup ticket when age or institution validation fails", async () => {
    const query = vi.fn(async (..._args: unknown[]) => ({
      rows: [] as Record<string, unknown>[],
      rowCount: 0,
    }));
    const transaction = vi.fn();
    const get = vi.fn(async (..._args: unknown[]) => "signup@example.com");
    const getdel = vi.fn(async (..._args: unknown[]) => "signup@example.com");
    const database = {
      pool: { query },
      transaction,
    } as unknown as DatabaseService;
    const redis = {
      client: {
        get,
        getdel,
      },
    } as unknown as RedisService;
    const controller = new IdentityController(
      database,
      redis,
      {} as RedisRateLimiter,
      parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );
    const request = { ip: "127.0.0.1" } as never;
    const reply = { header: vi.fn() } as never;
    const baseInput = {
      signupTicket: "signup-ticket",
      username: "valid-user",
      schoolId: "unknown-school",
      educationStatus: "student" as const,
      dateOfBirth: "2015-01-01",
    };

    await expect(controller.signup(baseInput, request, reply)).rejects.toMatchObject({
      status: 400,
      code: "age_not_allowed",
    });
    await expect(controller.signup({
      ...baseInput,
      dateOfBirth: "2000-01-01",
    }, request, reply)).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });

    expect(getdel).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(2);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("persists alumni status without marking the profile as verified", async () => {
    const profileRow = {
      id: "alumni-user",
      username: "alumni-test",
      school_id: "fut-minna",
      school_name: "FUT Minna",
      education_status: "alumni",
      verified_student: false,
      joined_at: new Date(),
    };
    const poolQuery = vi.fn(async (sql: string, ..._args: unknown[]) => ({
      rows: sql.includes("SELECT id, username")
        ? [profileRow]
        : sql.includes("SELECT name FROM users.schools")
          ? [{ name: "FUT Minna" }]
          : [],
      rowCount: 1,
    }));
    const profileInsert = vi.fn();
    const transaction = async (work: (client: unknown) => Promise<unknown>) => work({
      query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO users.profiles")) profileInsert(sql, values);
        return { rows: [], rowCount: 1 };
      },
    });
    const database = {
      pool: { query: poolQuery },
      transaction,
    } as unknown as DatabaseService;
    const getdel = vi.fn(async (..._args: unknown[]) => "alumni@example.com");
    const redis = {
      client: {
        get: vi.fn(async (..._args: unknown[]) => "alumni@example.com"),
        getdel,
        del: vi.fn(async () => 1),
      },
    } as unknown as RedisService;
    const controller = new IdentityController(
      database,
      redis,
      {} as RedisRateLimiter,
      parseBackendConfig({ NODE_ENV: "development", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square", AUTH_CODE_PEPPER: "p".repeat(32), AUTH_DEV_BYPASS: "true" }),
    );

    await expect(controller.signup(
      {
        signupTicket: "signup-ticket",
        username: "alumni-test",
        schoolId: "fut-minna",
        educationStatus: "alumni",
        dateOfBirth: "1990-01-02",
      },
      { ip: "127.0.0.1" } as never,
      { header: vi.fn() } as never,
    )).resolves.toMatchObject({
      user: {
        educationStatus: "alumni",
        verifiedStudent: false,
      },
    });

    expect(profileInsert.mock.calls[0]?.[0]).toContain("education_status, verified_student");
    expect(getdel).toHaveBeenCalledTimes(1);
    const values = profileInsert.mock.calls[0]?.[1] as unknown[];
    expect(values[0]).toMatch(/^[a-f0-9]{32}$/);
    expect(values.slice(1)).toEqual([
      "alumni-test",
      "fut-minna",
      "FUT Minna",
      "alumni",
      "01-02",
      "1990-01-02",
    ]);
  });
});

describe("IdentityController sessions", () => {
  it("lists only active sessions for the authenticated account and marks the current session", async () => {
    const sessions = [{
      id: "session-1",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      last_used_at: new Date("2026-01-02T00:00:00.000Z"),
      expires_at: new Date("2026-02-01T00:00:00.000Z"),
      user_agent_hash: "agent-hash",
      ip_hash: "ip-hash",
    }];
    const query = vi.fn(async (..._args: unknown[]) => ({ rows: sessions, rowCount: 1 }));
    const controller = new IdentityController(
      { pool: { query } } as unknown as DatabaseService,
      {} as RedisService,
      {} as RedisRateLimiter,
      parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );

    await expect(controller.sessions({
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never)).resolves.toEqual([{
      id: "session-1",
      createdAt: sessions[0].created_at,
      lastUsedAt: sessions[0].last_used_at,
      expiresAt: sessions[0].expires_at,
      current: true,
    }]);
    expect(query.mock.calls[0]?.[0]).toContain("account_id = $1");
    expect(query.mock.calls[0]?.[0]).toContain("revoked_at IS NULL");
    expect(query.mock.calls[0]?.[1]).toEqual(["user-1"]);
  });

  it("does not revoke a session that is not owned by the authenticated account", async () => {
    const query = vi.fn(async (..._args: unknown[]) => ({ rows: [], rowCount: 0 }));
    const controller = new IdentityController(
      { pool: { query } } as unknown as DatabaseService,
      { client: {} } as unknown as RedisService,
      {} as RedisRateLimiter,
      parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );

    await expect(controller.revokeSession("other-user-session", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never)).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(query.mock.calls[0]?.[0]).toContain("account_id = $2");
    expect(query.mock.calls[0]?.[1]).toEqual(["other-user-session", "user-1"]);
  });
});

describe("IdentityController institution search", () => {
  it("returns database-backed institution suggestions for a search term", async () => {
    const query = vi.fn(async () => ({
      rows: [{
        id: "fut-minna",
        name: "FUT Minna",
        institutionType: "university",
        ownership: "federal",
      }],
      rowCount: 1,
    }));
    const controller = new IdentityController(
      { pool: { query } } as unknown as DatabaseService,
      {} as RedisService,
      {} as RedisRateLimiter,
      parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square" }),
    );

    await expect(controller.schools("  FUT ")).resolves.toEqual([{
      id: "fut-minna",
      name: "FUT Minna",
      institutionType: "university",
      ownership: "federal",
    }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("users.school_aliases"),
      ["%fut%", "fut", "fut%"],
    );
    await expect(controller.schools("")).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
