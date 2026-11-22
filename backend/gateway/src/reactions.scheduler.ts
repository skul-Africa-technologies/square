import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ReactionsService } from "./reactions.service";

@Injectable()
export class ReactionsScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReactionsScheduler.name);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly reactions: ReactionsService) {}

  onApplicationBootstrap(): void {
    this.scheduleNextRun();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNextRun(): void {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    this.timer = setTimeout(() => { void this.run(); }, Math.max(1, next.getTime() - now.getTime()));
  }

  private async run(): Promise<void> {
    try {
      if (await this.reactions.reconcileCounts()) {
        this.logger.log("Reconciled community and DM reaction counts");
      }
    } catch (error) {
      this.logger.error(
        "Reaction-count reconciliation failed",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.scheduleNextRun();
    }
  }
}
