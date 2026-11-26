import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { CsrfGuard, JwtAuthGuard, parseBackendConfig } from "@square/kernel";

function contextFor(request: Record<string, unknown>, handler = () => undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe("gateway security guards", () => {
  const config = parseBackendConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square", CORS_ORIGINS: "http://localhost:3000", AUTH_CODE_PEPPER: "p".repeat(32) });

  it("allows an unauthenticated public route but default-denies protected routes", async () => {
    const publicHandler = () => undefined;
    const reflector = {
      getAllAndOverride: (key: string, targets: unknown[]) =>
        targets[0] === publicHandler && key === "square:public" ? true : undefined,
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(config, reflector, { client: { get: async () => null } } as never);

    await expect(guard.canActivate(contextFor({ headers: {} }, publicHandler))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
    });
  });

  it("rejects dev_ access tokens unless AUTH_DEV_BYPASS is explicitly enabled", async () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const redis = { client: { get: async () => null } } as never;

    const strictConfig = parseBackendConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square",
      AUTH_CODE_PEPPER: "p".repeat(32),
    });
    const strictGuard = new JwtAuthGuard(strictConfig, reflector, redis);
    await expect(
      strictGuard.canActivate(contextFor({ headers: { cookie: "__Host-sq_access=dev_user123" } })),
    ).rejects.toMatchObject({ status: 401 });

    const bypassConfig = parseBackendConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://square:square@127.0.0.1:5432/square",
      AUTH_CODE_PEPPER: "p".repeat(32),
      AUTH_DEV_BYPASS: "true",
    });
    const bypassGuard = new JwtAuthGuard(bypassConfig, reflector, redis);
    const request: Record<string, unknown> = { headers: { cookie: "__Host-sq_access=dev_user123" } };
    await expect(bypassGuard.canActivate(contextFor(request))).resolves.toBe(true);
    expect((request.user as { id: string }).id).toBe("user123");
  });

  it("requires a matching same-origin CSRF value for cookie-authenticated writes", () => {
    const guard = new CsrfGuard(config);
    const request = {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: "__Host-sq_access=token; __Host-sq_csrf=0123456789abcdef",
        "x-square-csrf": "0123456789abcdef",
      },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(() =>
      guard.canActivate(
        contextFor({
          ...request,
          headers: { ...request.headers, "x-square-csrf": "wrong-token-value" },
        }),
      ),
    ).toThrowError();
    expect(() =>
      guard.canActivate(
        contextFor({
          ...request,
          headers: { ...request.headers, origin: "https://attacker.example" },
        }),
      ),
    ).toThrowError();
  });
});
