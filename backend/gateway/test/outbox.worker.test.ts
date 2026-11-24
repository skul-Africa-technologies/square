import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutboxWorker } from "../src/outbox.worker";

describe("OutboxWorker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("publishes batches repeatedly and stops scheduling on shutdown", async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const publishBatch = vi.fn().mockResolvedValue(1);
    const worker = new OutboxWorker({ publishBatch } as never);

    worker.onApplicationBootstrap();
    await vi.runOnlyPendingTimersAsync();
    expect(publishBatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishBatch).toHaveBeenCalledTimes(2);

    worker.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishBatch).toHaveBeenCalledTimes(2);
  });

  it("logs failures and retries on the next interval", async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const publishBatch = vi.fn()
      .mockRejectedValueOnce(new Error("redis unavailable"))
      .mockResolvedValueOnce(0);
    const worker = new OutboxWorker({ publishBatch } as never);

    worker.onApplicationBootstrap();
    await vi.runOnlyPendingTimersAsync();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      "Outbox batch publishing failed",
      expect.any(String),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishBatch).toHaveBeenCalledTimes(2);
    worker.onApplicationShutdown();
  });
});
