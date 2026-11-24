import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { ApiException } from "./errors";
import type { BackendConfig } from "./config";
import type { RedisService } from "./redis";

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  trustLevel: number;
  sessionVersion: number;
}

type AuthenticatedRequest = FastifyRequest & { user?: AuthenticatedUser };
export const PUBLIC_ROUTE = "square:public";
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

export function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const [key, ...valueParts] = pair.trim().split("=");
    if (key === name) return valueParts.join("=");
  }
  return undefined;
}

export function authCookieNames(config: BackendConfig) {
  const prefix = config.COOKIE_DOMAIN ? "__Secure-sq" : "__Host-sq";
  return {
    access: `${prefix}_access`,
    refresh: `${prefix}_refresh`,
    csrf: config.COOKIE_DOMAIN ? "sq_csrf" : "__Host-sq_csrf",
  };
}

export async function validateJwtKeyPair(config: BackendConfig): Promise<void> {
  if (!config.JWT_PUBLIC_KEY && !config.JWT_PRIVATE_KEY) return;
  if (!config.JWT_PUBLIC_KEY || !config.JWT_PRIVATE_KEY) {
    throw new Error("JWT public and private keys must be configured together");
  }
  try {
    const [privateKey, publicKey] = await Promise.all([
      importPKCS8(config.JWT_PRIVATE_KEY, "EdDSA"),
      importSPKI(config.JWT_PUBLIC_KEY, "EdDSA"),
    ]);
    const probe = await new SignJWT({ keyCheck: true })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuedAt()
      .setExpirationTime("30s")
      .sign(privateKey);
    await jwtVerify(probe, publicKey, { algorithms: ["EdDSA"] });
  } catch {
    throw new Error("JWT public and private keys are invalid or do not match");
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: BackendConfig,
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = cookieValue(request.headers.cookie, authCookieNames(this.config).access);
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

    let claims: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
      const key = await importSPKI(this.config.JWT_PUBLIC_KEY, "EdDSA");
      claims = (await jwtVerify(token, key, {
        algorithms: ["EdDSA"],
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
      })).payload;
    } catch {
      throw new ApiException(401, "unauthenticated", "Sign in to continue");
    }

    if (
      typeof claims.sub !== "string" ||
      typeof claims.sid !== "string" ||
      typeof claims.tl !== "number" ||
      typeof claims.v !== "number"
    ) {
      throw new ApiException(401, "unauthenticated", "Sign in to continue");
    }

    try {
      if (await this.redis.client.get(`sid:deny:${claims.sid}`)) {
        throw new ApiException(401, "session_revoked", "Sign in to continue");
      }
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw new ApiException(503, "service_unavailable", "Authentication is temporarily unavailable");
    }

    request.user = {
      id: claims.sub,
      sessionId: claims.sid,
      trustLevel: claims.tl,
      sessionVersion: claims.v,
    };
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;
  private readonly cookieNames: ReturnType<typeof authCookieNames>;

  constructor(config: BackendConfig) {
    this.allowedOrigins = new Set(config.CORS_ORIGINS.map((origin) => new URL(origin).origin));
    this.cookieNames = authCookieNames(config);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;

    const origin = request.headers.origin;
    const token = request.headers["x-square-csrf"] ?? request.headers["x-csrf-token"];
    const cookieToken = cookieValue(request.headers.cookie, this.cookieNames.csrf);
    const hasSession =
      cookieValue(request.headers.cookie, this.cookieNames.access) !== undefined ||
      cookieValue(request.headers.cookie, this.cookieNames.refresh) !== undefined;
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
