import { Controller, Get, Header, Inject, Req, Res } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { register } from "prom-client";
import { isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";
import type { BackendConfig } from "@square/kernel";
import { DatabaseService, RedisService } from "@square/kernel";
import { Public } from "@square/kernel";
import { BACKEND_CONFIG } from "./tokens";

@Controller()
@ApiTags("health")
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(BACKEND_CONFIG) private readonly config: BackendConfig,
  ) {}

  @Get("healthz")
  @Public()
  @ApiOperation({ summary: "Check gateway liveness" })
  @ApiResponse({ status: 200, description: "Gateway is alive" })
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("readyz")
  @Public()
  @ApiOperation({ summary: "Check gateway dependencies" })
  @ApiResponse({ status: 200, description: "Gateway and dependencies are ready" })
  @ApiResponse({ status: 503, description: "A required dependency is unavailable" })
  async readiness(@Res() reply: FastifyReply): Promise<void> {
    const [postgres, redis] = await Promise.allSettled([this.database.probe(), this.redis.probe()]);
    const checks = {
      postgres: postgres.status === "fulfilled" ? "ok" : "unavailable",
      redis: redis.status === "fulfilled" && redis.value === "PONG" ? "ok" : "unavailable",
    } as const;
    const ready = checks.postgres === "ok" && checks.redis === "ok";
    reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "degraded",
      degraded: !ready,
      checks,
    });
  }

  @Get("metrics")
  @Public()
  @Header("Cache-Control", "no-store")
  @ApiExcludeEndpoint()
  async metrics(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const isLoopback =
      isIP(request.ip) > 0 &&
      (request.ip === "127.0.0.1" || request.ip === "::1" || request.ip.startsWith("::ffff:127."));
    const authorization = request.headers.authorization;
    const expectedToken = this.config.METRICS_TOKEN;
    const suppliedToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const tokenAllowed =
      expectedToken !== undefined &&
      suppliedToken.length === expectedToken.length &&
      timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(expectedToken));
    if (!tokenAllowed && !(this.config.NODE_ENV !== "production" && isLoopback)) {
      reply.code(404).send();
      return;
    }

    reply.type(register.contentType).send(await register.metrics());
  }
}
