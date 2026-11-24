import { Module } from "@nestjs/common";
import {
  DatabaseService,
  OutboxRelay,
  parseBackendConfig,
  RedisService,
} from "@square/kernel";
import { BACKEND_CONFIG } from "./tokens";
import { OutboxWorker } from "./outbox.worker";

const config = parseBackendConfig(process.env);

@Module({
  providers: [
    { provide: BACKEND_CONFIG, useValue: config },
    { provide: DatabaseService, useFactory: () => new DatabaseService(config) },
    { provide: RedisService, useFactory: () => new RedisService(config) },
    {
      provide: OutboxRelay,
      useFactory: (database: DatabaseService, redis: RedisService) => new OutboxRelay(database, redis),
      inject: [DatabaseService, RedisService],
    },
    OutboxWorker,
  ],
})
export class WorkerModule {}
