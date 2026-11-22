import "reflect-metadata";
import { config as loadDotEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { RequestMethod } from "@nestjs/common";
import compress from "@fastify/compress";
import helmet from "@fastify/helmet";
import { ApiException, ApiExceptionFilter, parseBackendConfig } from "@square/kernel";
import { collectDefaultMetrics, Counter, Histogram, register as metricsRegistry } from "prom-client";

async function bootstrap(): Promise<void> {
  loadDotEnv({ path: resolve(__dirname, "../../../.env"), quiet: true });
  const config = parseBackendConfig(process.env);
  const { AppModule } = await import("./app.module");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: config.NODE_ENV === "development" ? "info" : "warn",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers.x-square-csrf",
            "req.headers.x-api-key",
            "req.url",
          ],
          censor: "[redacted]",
        },
      },
      bodyLimit: 64 * 1024,
      requestIdHeader: false,
      genReqId: () => randomUUID(),
      trustProxy: false,
    }),
    { bufferLogs: true },
  );
  const fastify = app.getHttpAdapter().getInstance();
  const requestStartedAt = new WeakMap<object, number>();
  const requestCounter = new Counter({
    name: "square_http_requests_total",
    help: "Completed HTTP requests served by the gateway",
    labelNames: ["method", "route", "status"] as const,
  });
  const requestDuration = new Histogram({
    name: "square_http_request_duration_seconds",
    help: "Gateway request duration in seconds",
    labelNames: ["method", "route"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: config.NODE_ENV === "production" ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  });
  await app.register(compress, { global: true });
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Square-CSRF", "Idempotency-Key", "If-Match", "Last-Event-ID"],
    maxAge: 600,
  });
  fastify.addHook("onRequest", async (request, reply) => {
    requestStartedAt.set(request, performance.now());
    reply.header("X-Request-Id", request.id);
  });
  fastify.addHook("preValidation", async (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
      if (contentType !== "application/json") {
        throw new ApiException(415, "unsupported_media_type", "Requests must use application/json");
      }
    }
  });
  fastify.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url ?? "unmatched";
    requestCounter.inc({ method: request.method, route, status: String(reply.statusCode) });
    const startedAt = requestStartedAt.get(request);
    if (startedAt !== undefined) requestDuration.observe({ method: request.method, route }, (performance.now() - startedAt) / 1000);
  });

  app.setGlobalPrefix("v1", {
    exclude: [
      { path: "healthz", method: RequestMethod.GET },
      { path: "readyz", method: RequestMethod.GET },
      { path: "metrics", method: RequestMethod.GET },
    ],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  metricsRegistry.setDefaultLabels({ service: "gateway", environment: config.NODE_ENV });
  collectDefaultMetrics({ register: metricsRegistry });

  if (config.NODE_ENV !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Square API")
      .setDescription("Square backend gateway API")
      .setVersion("1.0")
      .addCookieAuth("__Host-sq_access", {
        type: "apiKey",
        in: "cookie",
        name: "__Host-sq_access",
      })
      .addApiKey({ type: "apiKey", in: "header", name: "X-Square-CSRF" }, "csrf")
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document, {
      jsonDocumentUrl: "docs/openapi.json",
      swaggerOptions: { persistAuthorization: false },
    });
  }

  await app.listen(config.PORT, "0.0.0.0");
  fastify.log.info({ port: config.PORT, services: config.SERVICES }, "Square backend gateway listening");
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown startup error";
  process.stderr.write(`backend startup failed: ${message}\n`);
  process.exitCode = 1;
});
