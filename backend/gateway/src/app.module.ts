import { Module } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import {
  ApiExceptionFilter,
  CsrfGuard,
  DatabaseService,
  JwtAuthGuard,
  OutboxRelay,
  parseBackendConfig,
  RedisRateLimiter,
  RedisService,
} from "@square/kernel";
import { HealthController } from "./health.controller";
import { GatewayController } from "./gateway.controller";
import { ReactionsController } from "./reactions.controller";
import { ReactionsScheduler } from "./reactions.scheduler";
import { ReactionsService } from "./reactions.service";
import { BACKEND_CONFIG } from "./tokens";
import { IdentityController } from "./identity.controller";
import { PlatformController } from "./platform.controller";
import { ConversationController } from "./conversation.controller";
import { ContentController } from "./content.controller";
import { ModerationController } from "./moderation.controller";
import { ReputationController } from "./reputation.controller";
import { ReputationService } from "./reputation.service";
import { loadScoringConfig, SCORING_CONFIG, type ScoringConfig } from "./reputation.config";

const config = parseBackendConfig(process.env);

@Module({
  controllers: [HealthController, GatewayController, IdentityController, PlatformController, ConversationController, ContentController, ModerationController, ReactionsController, ReputationController],
  providers: [
    { provide: BACKEND_CONFIG, useValue: config },
    { provide: DatabaseService, useFactory: () => new DatabaseService(config) },
    { provide: RedisService, useFactory: () => new RedisService(config) },
    {
      provide: RedisRateLimiter,
      useFactory: (redis: RedisService) => new RedisRateLimiter(redis.client),
      inject: [RedisService],
    },
    ReactionsService,
    { provide: SCORING_CONFIG, useFactory: () => loadScoringConfig() },
    {
      provide: ReputationService,
      useFactory: (config: ScoringConfig) => new ReputationService(config),
      inject: [SCORING_CONFIG],
    },
    ReactionsScheduler,
    {
      provide: OutboxRelay,
      useFactory: (db: DatabaseService, redis: RedisService) => new OutboxRelay(db, redis),
      inject: [DatabaseService, RedisService],
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector, redis: RedisService) => new JwtAuthGuard(config, reflector, redis),
      inject: [Reflector, RedisService],
    },
    { provide: APP_GUARD, useFactory: () => new CsrfGuard(config) },
    ApiExceptionFilter,
  ],
})
export class AppModule {}
