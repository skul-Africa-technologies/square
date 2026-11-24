import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { OutboxRelay } from "@square/kernel";

@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly relay: OutboxRelay) {}

  onApplicationBootstrap(): void {
    this.schedule(0);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      void this.publish();
    }, delay);
  }

  private async publish(): Promise<void> {
    try {
      const count = await this.relay.publishBatch();
      if (count > 0) this.logger.log(`Published ${count} outbox events`);
    } catch (error) {
      this.logger.error(
        "Outbox batch publishing failed",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.schedule(1_000);
    }
  }
}
