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
  const config = parseBackendConfig({ CORS_ORIGINS: "http://localhost:3000" });

  it("allows an unauthenticated public route but default-denies protected routes", async () => {
    const publicHandler = () => undefined;
    const reflector = {
      getAllAndOverride: (key: string, targets: unknown[]) =>
        targets[0] === publicHandler && key === "square:public" ? true : undefined,
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(config, reflector);

    await expect(guard.canActivate(contextFor({ headers: {} }, publicHandler))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
    });
  });

  it("requires a matching same-origin CSRF value for cookie-authenticated writes", () => {
    const guard = new CsrfGuard(config);
    const request = {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: "__Host-sq_access=token; sq_csrf=0123456789abcdef",
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
