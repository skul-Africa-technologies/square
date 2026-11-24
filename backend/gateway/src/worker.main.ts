import "reflect-metadata";
import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { parseBackendConfig } from "@square/kernel";

async function bootstrap(): Promise<void> {
  loadDotEnv({ path: resolve(__dirname, "../../../.env"), quiet: true });
  parseBackendConfig(process.env);
  const { WorkerModule } = await import("./worker.module");
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["log", "warn", "error"],
  });
  application.enableShutdownHooks();
  process.stdout.write("Square outbox worker started\n");
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`outbox worker startup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
