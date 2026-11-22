import "reflect-metadata";
import Fastify from "fastify";

async function startDummyService(): Promise<void> {
  const port = Number(process.env.DUMMY_PORT ?? 4010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid DUMMY_PORT");

  const app = Fastify({
    logger: { level: "warn" },
    bodyLimit: 64 * 1024,
    requestIdHeader: false,
  });
  app.get("/healthz", async () => ({ status: "ok", service: "dummy" }));
  app.get("/readyz", async () => ({ status: "ready", service: "dummy" }));
  await app.listen({ port, host: "0.0.0.0" });
}

startDummyService().catch((error: unknown) => {
  process.stderr.write(`dummy service startup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
