import { describe, expect, it } from "vitest";
import { parseBackendConfig } from "../src/config";

describe("parseBackendConfig", () => {
  it("uses safe local defaults and normalizes CORS origins", () => {
    const config = parseBackendConfig({
      CORS_ORIGINS: "http://localhost:3000, https://square.example",
      SIGNUP_ENABLED: "false",
    });

    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual(["http://localhost:3000", "https://square.example"]);
    expect(config.SIGNUP_ENABLED).toBe(false);
    expect(config.REDIS_URL).toBe("redis://127.0.0.1:6379");
  });

  it("rejects malformed origins and ports without exposing the supplied value", () => {
    expect(() => parseBackendConfig({ PORT: "70000" })).toThrow(/PORT/);
    expect(() => parseBackendConfig({ CORS_ORIGINS: "*" })).toThrow(/CORS_ORIGINS/);
    expect(() => parseBackendConfig({ BREVO_API_KEY: "configured-without-sender" })).toThrow(/BREVO_API_KEY/);
  });

  it("requires secure database, Redis, CORS and metrics configuration in production", () => {
    expect(() => parseBackendConfig({ NODE_ENV: "production" })).toThrow(/Production/);
  });
});
