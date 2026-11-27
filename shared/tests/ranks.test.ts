import { describe, expect, it } from "vitest";
import { RANKS, RANK_KEYS, getRank, nextRank, isRankKey, MAX_RANK } from "../src/ranks";

describe("rank metadata", () => {
  it("has exactly 13 ranks with unique keys and unique icons, in order", () => {
    expect(RANKS).toHaveLength(13);
    expect(new Set(RANKS.map((r) => r.key)).size).toBe(13);
    expect(new Set(RANKS.map((r) => r.icon)).size).toBe(13);
    RANKS.forEach((r, i) => expect(r.position).toBe(i + 1));
    expect(RANK_KEYS[0]).toBe("nobis");
    expect(MAX_RANK).toBe("infinity");
  });

  it("uses title-case names (no uppercase transform needed)", () => {
    for (const r of RANKS) {
      expect(r.name).toBe(r.name.charAt(0).toUpperCase() + r.name.slice(1).toLowerCase());
    }
  });

  it("assigns tier treatment by position", () => {
    const tier = (pos: number) => getRank(RANKS[pos - 1].key)!.tier;
    expect(tier(1)).toBe(1);
    expect(tier(5)).toBe(2);
    expect(tier(9)).toBe(3);
    expect(tier(12)).toBe(4);
    expect(tier(13)).toBe(5);
    expect(getRank("infinity")!.gradient).toContain("linear-gradient");
  });

  it("nextRank walks up and is null at Infinity", () => {
    expect(nextRank("nobis")!.key).toBe("node");
    expect(nextRank("sovereign")!.key).toBe("infinity");
    expect(nextRank("infinity")).toBeNull();
    expect(isRankKey("pioneer")).toBe(true);
    expect(isRankKey("nope")).toBe(false);
  });
});