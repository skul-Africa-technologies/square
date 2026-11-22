import { describe, expect, it } from "vitest";
import {
  MAX_DISTINCT_REACTIONS_PER_MESSAGE,
  MAX_REACTIONS_PER_USER_PER_MESSAGE,
  addReactionSummary,
  isAllowedReactionEmoji,
  removeReactionSummary,
} from "../src/reactions";

describe("message reaction rules", () => {
  it("accepts fully-qualified RGI emoji and skin-tone sequences only", () => {
    expect(isAllowedReactionEmoji("❤️")).toBe(true);
    expect(isAllowedReactionEmoji("👍🏽")).toBe(true);
    expect(isAllowedReactionEmoji("👨‍👩‍👧‍👦")).toBe(true);
    expect(isAllowedReactionEmoji("❤")).toBe(false);
    expect(isAllowedReactionEmoji("not emoji")).toBe(false);
    expect(isAllowedReactionEmoji("")).toBe(false);
  });

  it("toggles the current user's reaction without changing first-use order", () => {
    const initial = [
      { emoji: "👍", count: 2, me: false },
      { emoji: "❤️", count: 1, me: true },
    ];
    const added = addReactionSummary(initial, "👍", "u1", "u1");
    expect(added).toEqual([
      { emoji: "👍", count: 3, me: true },
      { emoji: "❤️", count: 1, me: true },
    ]);
    expect(removeReactionSummary(added, "👍")).toEqual([
      { emoji: "👍", count: 2, me: false },
      { emoji: "❤️", count: 1, me: true },
    ]);
  });

  it("publishes the shared per-message and per-user reaction limits", () => {
    expect(MAX_DISTINCT_REACTIONS_PER_MESSAGE).toBe(20);
    expect(MAX_REACTIONS_PER_USER_PER_MESSAGE).toBe(10);
  });
});
