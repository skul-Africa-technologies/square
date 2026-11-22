import { describe, expect, it, vi } from "vitest";
import type { FastifyReply } from "fastify";
import { parseBackendConfig } from "@square/kernel";
import { HealthController } from "../src/health.controller";

function replyMock() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn(),
  };
  return reply as unknown as FastifyReply & typeof reply;
}

describe("HealthController", () => {
  const config = parseBackendConfig({});

  it("reports ready only when Postgres is migrated and Redis responds", async () => {
    const controller = new HealthController(
      { probe: vi.fn().mockResolvedValue(undefined) } as never,
      { probe: vi.fn().mockResolvedValue("PONG") } as never,
      config,
    );
    const reply = replyMock();

    await controller.readiness(reply);

    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      status: "ready",
      degraded: false,
      checks: { postgres: "ok", redis: "ok" },
    });
  });

  it("returns degraded readiness without leaking dependency error details", async () => {
    const controller = new HealthController(
      { probe: vi.fn().mockRejectedValue(new Error("postgres://secret@host")) } as never,
      { probe: vi.fn().mockResolvedValue("PONG") } as never,
      config,
    );
    const reply = replyMock();

    await controller.readiness(reply);

    expect(reply.code).toHaveBeenCalledWith(503);
    expect(JSON.stringify(reply.send.mock.calls[0])).not.toContain("secret");
    expect(reply.send).toHaveBeenCalledWith({
      status: "degraded",
      degraded: true,
      checks: { postgres: "unavailable", redis: "ok" },
    });
  });
});
