import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "@square/kernel";
import { ContentController } from "../src/content.controller";

function controller() {
  const database = {
    pool: {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    },
  } as unknown as DatabaseService;
  return new ContentController(database);
}

describe("ContentController", () => {
  it("rejects posts with no body", async () => {
    await expect(controller().createPost("asset-1", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never, { body: " " })).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
  });

  it("rejects events without title or start time", async () => {
    await expect(controller().createEvent("asset-1", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never, { title: "Demo" })).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
  });

  it("rejects unsupported RSVP states", async () => {
    await expect(controller().rsvp("event-1", {
      user: { id: "user-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
    } as never, { state: "maybe" })).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
  });
});
