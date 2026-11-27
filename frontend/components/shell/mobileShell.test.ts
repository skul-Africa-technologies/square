import { describe, expect, it } from "vitest";
import { STRIP_WIDTH_FULL, isRoomRoute } from "./mobileShell";

describe("isRoomRoute", () => {
  it("hides the strip on DM threads and asset/item pages", () => {
    expect(isRoomRoute("/dm/conversation-123")).toBe(true);
    expect(isRoomRoute("/c/campus/chat")).toBe(true);
    expect(isRoomRoute("/c/campus/announcements")).toBe(true);
    expect(isRoomRoute("/c/campus/events/evt-1")).toBe(true);
    expect(isRoomRoute("/c/campus/boards/b-1/items/i-1")).toBe(true);
  });

  it("keeps the strip visible on hub and list screens", () => {
    expect(isRoomRoute("/home")).toBe(false);
    expect(isRoomRoute("/dm")).toBe(false);
    expect(isRoomRoute("/inbox")).toBe(false);
    expect(isRoomRoute("/c/campus")).toBe(false);
    expect(isRoomRoute("/explore")).toBe(false);
    expect(isRoomRoute("/settings")).toBe(false);
    expect(isRoomRoute("/settings/profile")).toBe(false);
    expect(isRoomRoute("/u/alice")).toBe(false);
  });

  it("uses a 72px full strip width", () => {
    expect(STRIP_WIDTH_FULL).toBe(72);
  });
});