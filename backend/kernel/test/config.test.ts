import { describe, expect, it } from "vitest";
import { parseBackendConfig } from "../src/config";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square",
  AUTH_CODE_PEPPER: "p".repeat(32),
};

describe("parseBackendConfig", () => {
  it("uses safe local defaults and normalizes CORS origins", () => {
    const config = parseBackendConfig({
      ...base,
      CORS_ORIGINS: "http://localhost:3000, https://square.example",
      SIGNUP_ENABLED: "false",
    });

    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual(["http://localhost:3000", "https://square.example"]);
    expect(config.SIGNUP_ENABLED).toBe(false);
    expect(config.REDIS_URL).toBe("redis://127.0.0.1:6379");
    expect(config.DIRECT_URL).toBeUndefined();
    expect(config.AUTH_DEV_BYPASS).toBe(false);
  });

  it("requires NODE_ENV and DATABASE_URL explicitly (no development fallback)", () => {
    expect(() => parseBackendConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/NODE_ENV/);
    expect(() => parseBackendConfig({ NODE_ENV: "development" })).toThrow(/DATABASE_URL/);
  });

  it("accepts a separate direct PostgreSQL connection for migrations", () => {
    const config = parseBackendConfig({
      ...base,
      DATABASE_URL: "postgresql://square:app@db-pooler.example/square",
      DIRECT_URL: "postgresql://square:migrator@db.example/square",
    });

    expect(config.DIRECT_URL).toBe("postgresql://square:migrator@db.example/square");
  });

  it("rejects malformed origins and ports without exposing the supplied value", () => {
    expect(() => parseBackendConfig({ ...base, PORT: "70000" })).toThrow(/PORT/);
    expect(() => parseBackendConfig({ ...base, CORS_ORIGINS: "*" })).toThrow(/CORS_ORIGINS/);
    expect(() => parseBackendConfig({ ...base, RESEND_API_KEY: "configured-without-sender" })).toThrow(/RESEND_API_KEY/);
  });

  it("requires AUTH_CODE_PEPPER outside of test", () => {
    expect(() => parseBackendConfig({
      NODE_ENV: "development",
      DATABASE_URL: base.DATABASE_URL,
    })).toThrow(/AUTH_CODE_PEPPER/);
    expect(() => parseBackendConfig({
      NODE_ENV: "production",
      DATABASE_URL: base.DATABASE_URL,
    })).toThrow(/AUTH_CODE_PEPPER/);
  });

  it("forbids AUTH_DEV_BYPASS in production", () => {
    expect(() => parseBackendConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://square:secret@db.example/square?sslmode=require",
      REDIS_URL: "rediss://square:secret@redis.example:6379",
      CORS_ORIGINS: "https://square.example",
      METRICS_TOKEN: "m".repeat(32),
      JWT_PUBLIC_KEY: "-----BEGIN PUBLIC KEY-----\npublic-key\n-----END PUBLIC KEY-----",
      JWT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nprivate-key\n-----END PRIVATE KEY-----",
      AUTH_CODE_PEPPER: "p".repeat(32),
      RESEND_API_KEY: "resend_test_key",
      RESEND_SENDER_EMAIL: "auth@example.com",
      AUTH_DEV_BYPASS: "true",
    })).toThrow(/AUTH_DEV_BYPASS/);
  });

  it("requires secure database, Redis, CORS and metrics configuration in production", () => {
    expect(() => parseBackendConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://square:secret@db.example/square",
    })).toThrow(/Production DATABASE_URL must require SSL/);
  });

  it("rejects the deterministic auth-code mode outside a test environment", () => {
    expect(() => parseBackendConfig({
      NODE_ENV: "production",
      CORS_ORIGINS: "https://square.example",
      METRICS_TOKEN: "metrics-token",
      JWT_PUBLIC_KEY: "-----BEGIN PUBLIC KEY-----\npublic-key\n-----END PUBLIC KEY-----",
      JWT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nprivate-key\n-----END PRIVATE KEY-----",
      AUTH_CODE_PEPPER: "p".repeat(32),
      RESEND_API_KEY: "resend_test_key",
      RESEND_SENDER_EMAIL: "auth@example.com",
      DATABASE_URL: "postgresql://square:secret@db.example/square?sslmode=require",
      REDIS_URL: "rediss://square:secret@redis.example:6379",
      AUTH_TEST_MODE: "true",
    })).toThrow(/AUTH_TEST_MODE/);
  });

  it("disables the deterministic auth-code mode by default", () => {
    expect(parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: base.DATABASE_URL }).AUTH_TEST_MODE).toBe(false);
  });
});