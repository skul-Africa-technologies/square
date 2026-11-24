import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { importSPKI, jwtVerify } from "jose";
import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { ApiException } from "./errors";
import type { BackendConfig } from "./config";

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  trustLevel: number;
  sessionVersion: number;
}

type AuthenticatedRequest = FastifyRequest & { user?: AuthenticatedUser };
export const PUBLIC_ROUTE = "square:public";
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const [key, ...valueParts] = pair.trim().split("=");
    if (key === name) return valueParts.join("=");
  }
  return undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: BackendConfig,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = cookieValue(request.headers.cookie, "__Host-sq_access");
    if (this.config.NODE_ENV === "development" && token?.startsWith("dev_")) {
      const id = token.slice(4);
      if (/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        request.user = { id, sessionId: "dev-session", trustLevel: 1, sessionVersion: 1 };
        return true;
      }
    }
    if (!token || !this.config.JWT_PUBLIC_KEY) {
      throw new ApiException(401, "unauthenticated", "Sign in to continue");
    }

    try {
      const key = await importSPKI(this.config.JWT_PUBLIC_KEY, "EdDSA");
      const verified = await jwtVerify(token, key, {
        algorithms: ["EdDSA"],
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
      });
      const claims = verified.payload;
      if (
        typeof claims.sub !== "string" ||
        typeof claims.sid !== "string" ||
        typeof claims.tl !== "number" ||
        typeof claims.v !== "number"
      ) {
        throw new Error("Required session claims are missing");
      }

      request.user = {
        id: claims.sub,
        sessionId: claims.sid,
        trustLevel: claims.tl,
        sessionVersion: claims.v,
      };
      return true;
    } catch {
      throw new ApiException(401, "unauthenticated", "Sign in to continue");
    }
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(config: BackendConfig) {
    this.allowedOrigins = new Set(config.CORS_ORIGINS.map((origin) => new URL(origin).origin));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;

    const origin = request.headers.origin;
    const token = request.headers["x-square-csrf"];
    const cookieToken =
      cookieValue(request.headers.cookie, "__Host-sq_csrf") ?? cookieValue(request.headers.cookie, "sq_csrf");
    const hasSession =
      cookieValue(request.headers.cookie, "__Host-sq_access") !== undefined ||
      cookieValue(request.headers.cookie, "__Host-sq_refresh") !== undefined;
    const sameOrigin = typeof origin === "string" && this.allowedOrigins.has(origin);

    if (!sameOrigin) {
      throw new ApiException(403, "csrf_failed", "Request origin or CSRF token is invalid");
    }
    if (!hasSession) return true;

    if (
      typeof token !== "string" ||
      !cookieToken ||
      token.length < 16 ||
      token.length !== cookieToken.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(cookieToken))
    ) {
      throw new ApiException(403, "csrf_failed", "Request origin or CSRF token is invalid");
    }
    return true;
  }
}
