import { createHash } from "node:crypto";
import type { ScoringConfig } from "./reputation.config";

/** A rank definition row (subset of reputation.rank_definitions). */
export interface RankDefRow {
  key: string;
  position: number;
  min_xp: number;
}

/** Highest rank whose min_xp <= xpTotal (monotonic; never demotes). */
export function deriveRank(xpTotal: number, defs: RankDefRow[]): string {
  let best = defs[0];
  for (const d of defs) {
    if (d.min_xp <= xpTotal && (!best || d.position > best.position)) best = d;
  }
  return best?.key ?? "nobis";
}

export interface RankProgress {
  rank: string;
  position: number;
  currentRankMinXp: number;
  nextRank: string | null;
  nextRankMinXp: number | null;
  xpToNext: number | null;
  progressPercent: number;
  isMaxRank: boolean;
}

/** Compute progress from xpTotal + defs. Frontend never does this; backend does. */
export function computeProgress(xpTotal: number, defs: RankDefRow[]): RankProgress {
  const sorted = [...defs].sort((a, b) => a.position - b.position);
  const current = deriveRank(xpTotal, sorted);
  const currentDef = sorted.find((d) => d.key === current)!;
  const next = sorted.find((d) => d.position === currentDef.position + 1) ?? null;
  if (!next) {
    return {
      rank: current,
      position: currentDef.position,
      currentRankMinXp: currentDef.min_xp,
      nextRank: null,
      nextRankMinXp: null,
      xpToNext: null,
      progressPercent: 100,
      isMaxRank: true,
    };
  }
  const span = next.min_xp - currentDef.min_xp;
  const into = xpTotal - currentDef.min_xp;
  const progressPercent = span <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((into / span) * 100)));
  return {
    rank: current,
    position: currentDef.position,
    currentRankMinXp: currentDef.min_xp,
    nextRank: next.key,
    nextRankMinXp: next.min_xp,
    xpToNext: Math.max(0, next.min_xp - xpTotal),
    progressPercent,
    isMaxRank: false,
  };
}

/** All ranks crossed between fromXpX and toXpX (exclusive of from, inclusive of to). */
export function ranksCrossed(fromXp: number, toXp: number, defs: RankDefRow[]): RankDefRow[] {
  return defs
    .filter((d) => d.min_xp > fromXp && d.min_xp <= toXp)
    .sort((a, b) => a.position - b.position);
}

/** Idempotency key derived from source + source_ref. */
export function idempotencyKey(source: string, sourceRef: string): string {
  return `${source}:${sourceRef}`;
}

/** Message quality: word + char thresholds. */
export function isQualityMessage(text: string, cfg: ScoringConfig): boolean {
  const trimmed = text.trim();
  if (trimmed.length < cfg.message.minChars) return false;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  return words >= cfg.message.minWords;
}

/** Normalized hash for near-duplicate detection. */
export function normalizeHash(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function isNearDuplicate(hash: string, recentHashes: readonly string[]): boolean {
  return recentHashes.includes(hash);
}

/** Cap a candidate award by remaining per-source cap and the overall daily cap. */
export function applyCaps(
  candidateXp: number,
  sourceCapRemaining: number,
  dailyRemaining: number,
): number {
  return Math.max(0, Math.min(candidateXp, sourceCapRemaining, dailyRemaining));
}

/** Reaction eligibility: different member, account older than 24h, setup complete, not muted/blocked. */
export function reactionEligible(ctx: {
  isSelf: boolean;
  accountAgeHours: number;
  setupComplete: boolean;
  mutedOrBlocked: boolean;
}): boolean {
  return !ctx.isSelf && ctx.accountAgeHours >= 24 && ctx.setupComplete && !ctx.mutedOrBlocked;
}

/** Reply eligibility (same guards as reactions, different member). */
export function replyEligible(ctx: {
  isSelf: boolean;
  accountAgeHours: number;
  setupComplete: boolean;
  mutedOrBlocked: boolean;
}): boolean {
  return reactionEligible(ctx);
}

/** Active-day qualifies when the member had at least N qualifying actions. */
export function isActiveDay(actionCount: number, cfg: ScoringConfig): boolean {
  return actionCount >= cfg.activeDay.minActions;
}