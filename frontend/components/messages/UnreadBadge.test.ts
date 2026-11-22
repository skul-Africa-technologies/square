import { describe, expect, it } from "vitest";
import { getUnreadBadgeState } from "./UnreadBadge";

describe("UnreadBadge state", () => {
  it("shows a number when there are no mentions", () => {
    expect(getUnreadBadgeState(3, 0)).toEqual({ kind: "count", count: "3" });
  });

  it("shows only the mention icon for one all-mention unread message and a count for multiple", () => {
    expect(getUnreadBadgeState(1, 1)).toEqual({ kind: "mentions" });
    expect(getUnreadBadgeState(2, 2)).toEqual({ kind: "mentions", count: "2" });
  });

  it("shows the total unread count with the mention icon when both kinds exist", () => {
    expect(getUnreadBadgeState(7, 2)).toEqual({ kind: "mixed", count: "7" });
  });

  it("caps displayed counts at 99+", () => {
    expect(getUnreadBadgeState(120, 0)).toEqual({ kind: "count", count: "99+" });
    expect(getUnreadBadgeState(120, 120)).toEqual({ kind: "mentions", count: "99+" });
  });
});
