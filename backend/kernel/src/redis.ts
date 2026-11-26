import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import Redis from "ioredis";
import type { BackendConfig } from "./config";

@Injectable()
export class RedisService implements OnApplicationShutdown {
  readonly client: Redis;

  constructor(config: BackendConfig) {
    this.client = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3_000,
      commandTimeout: 5_000,
      retryStrategy: (attempt) => Math.min(attempt * 250, 3_000),
    });
    this.client.on("error", () => process.stderr.write("redis connection error\n"));
  }

  async probe(): Promise<string> {
    if (this.client.status === "wait") await this.client.connect();
    return this.client.ping();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === "end") return;
    this.client.disconnect();
  }
}
