import { describe, expect, it } from "vitest";
import {
  applyCaps,
  computeProgress,
  deriveRank,
  idempotencyKey,
  isActiveDay,
  isNearDuplicate,
  isQualityMessage,
  normalizeHash,
  ranksCrossed,
  reactionEligible,
  replyEligible,
  type RankDefRow,
} from "../src/reputation.scoring";
import { DEFAULT_SCORING } from "../src/reputation.config";

const defs: RankDefRow[] = [
  { key: "nobis", position: 1, min_xp: 0 },
  { key: "node", position: 2, min_xp: 100 },
  { key: "byte", position: 3, min_xp: 300 },
  { key: "pioneer", position: 5, min_xp: 1400 },
  { key: "infinity", position: 13, min_xp: 50000 },
];

describe("deriveRank / progress", () => {
  it("derives the highest rank <= xp", () => {
    expect(deriveRank(0, defs)).toBe("nobis");
    expect(deriveRank(99, defs)).toBe("nobis");
    expect(deriveRank(100, defs)).toBe("node");
    expect(deriveRank(1400, defs)).toBe("pioneer");
    expect(deriveRank(999999, defs)).toBe("infinity");
  });

  it("never demotes (monotonic in xp)", () => {
    let prev = 0;
    for (let xp = 0; xp <= 2000; xp += 7) {
      const pos = defs.find((d) => d.key === deriveRank(xp, defs))!.position;
      expect(pos).toBeGreaterThanOrEqual(prev);
      prev = pos;
    }
  });

  it("crosses multiple ranks in one award", () => {
    const crossed = ranksCrossed(50, 1500, defs).map((d) => d.key);
    expect(crossed).toEqual(["node", "byte", "pioneer"]);
  });

  it("computes progress and xpToNext; null at max rank", () => {
    const p = computeProgress(120, defs);
    expect(p.rank).toBe("node");
    expect(p.nextRank).toBe("byte");
    expect(p.xpToNext).toBe(180);
    expect(p.progressPercent).toBe(10);
    const max = computeProgress(60000, defs);
    expect(max.isMaxRank).toBe(true);
    expect(max.nextRank).toBeNull();
    expect(max.xpToNext).toBeNull();
    expect(max.progressPercent).toBe(100);
  });
});

describe("idempotency", () => {
  it("derives a stable key from source + ref", () => {
    expect(idempotencyKey("msg", "m1")).toBe("msg:m1");
    expect(idempotencyKey("react", "m1:u2")).toBe("react:m1:u2");
  });
});

describe("message quality", () => {
  it("requires min words and chars", () => {
    expect(isQualityMessage("hi", DEFAULT_SCORING)).toBe(false);
    expect(isQualityMessage("two words", DEFAULT_SCORING)).toBe(false); // 2 words
    expect(isQualityMessage("three word message", DEFAULT_SCORING)).toBe(true);
    expect(isQualityMessage("a b c d e f g h i j k l m n o p", DEFAULT_SCORING)).toBe(true);
  });

  it("detects near-duplicates via normalized hash", () => {
    const h = normalizeHash("Hello   World");
    expect(normalizeHash("hello world")).toBe(h);
    expect(isNearDuplicate(h, [h])).toBe(true);
    expect(isNearDuplicate(h, ["other"])).toBe(false);
  });
});

describe("caps", () => {
  it("applies per-source and daily caps", () => {
    expect(applyCaps(10, 5, 100)).toBe(5);
    expect(applyCaps(10, 100, 3)).toBe(3);
    expect(applyCaps(10, 0, 100)).toBe(0);
    expect(applyCaps(10, 100, 100)).toBe(10);
  });
});

describe("eligibility", () => {
  const base = { isSelf: false, accountAgeHours: 48, setupComplete: true, mutedOrBlocked: false };
  it("reactions: self / under-24h / no-setup / muted earn nothing", () => {
    expect(reactionEligible(base)).toBe(true);
    expect(reactionEligible({ ...base, isSelf: true })).toBe(false);
    expect(reactionEligible({ ...base, accountAgeHours: 10 })).toBe(false);
    expect(reactionEligible({ ...base, setupComplete: false })).toBe(false);
    expect(reactionEligible({ ...base, mutedOrBlocked: true })).toBe(false);
  });
  it("replies use the same guards", () => {
    expect(replyEligible(base)).toBe(true);
    expect(replyEligible({ ...base, isSelf: true })).toBe(false);
  });
  it("active day requires min actions", () => {
    expect(isActiveDay(3, DEFAULT_SCORING)).toBe(true);
    expect(isActiveDay(2, DEFAULT_SCORING)).toBe(false);
  });
});