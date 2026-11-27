import { z } from "zod";

/**
 * Single source of truth for rank metadata (both sides).
 * Backend uses `key` + `position` only; the frontend also uses name/icon/colour.
 * `min_xp` thresholds intentionally live in the DB (rank_definitions), never here,
 * so the frontend never calculates XP or thresholds.
 */

export type RankKey =
  | "nobis"
  | "node"
  | "byte"
  | "pixel"
  | "pioneer"
  | "sentinel"
  | "validator"
  | "protocol"
  | "nexus"
  | "overclock"
  | "quantum"
  | "sovereign"
  | "infinity";

export type RankIconName =
  | "circle-dot"
  | "network"
  | "binary"
  | "grid-3x3"
  | "compass"
  | "shield-check"
  | "badge-check"
  | "workflow"
  | "orbit"
  | "zap"
  | "atom"
  | "crown"
  | "infinity";

/** 1 plain · 2 ringed · 3 double-ring · 4 soft glow · 5 premium gradient */
export type RankTier = 1 | 2 | 3 | 4 | 5;

export interface RankDefinition {
  readonly key: RankKey;
  readonly position: number;
  readonly name: string;
  readonly icon: RankIconName;
  readonly color: string;
  readonly tier: RankTier;
  readonly gradient?: string;
}

export const RANKS: readonly RankDefinition[] = [
  { key: "nobis", position: 1, name: "Nobis", icon: "circle-dot", color: "#60A5FA", tier: 1 },
  { key: "node", position: 2, name: "Node", icon: "network", color: "#F87171", tier: 1 },
  { key: "byte", position: 3, name: "Byte", icon: "binary", color: "#22D3EE", tier: 1 },
  { key: "pixel", position: 4, name: "Pixel", icon: "grid-3x3", color: "#A78BFA", tier: 1 },
  { key: "pioneer", position: 5, name: "Pioneer", icon: "compass", color: "#4ADE80", tier: 2 },
  { key: "sentinel", position: 6, name: "Sentinel", icon: "shield-check", color: "#2DD4BF", tier: 2 },
  { key: "validator", position: 7, name: "Validator", icon: "badge-check", color: "#10B981", tier: 2 },
  { key: "protocol", position: 8, name: "Protocol", icon: "workflow", color: "#818CF8", tier: 2 },
  { key: "nexus", position: 9, name: "Nexus", icon: "orbit", color: "#C084FC", tier: 3 },
  { key: "overclock", position: 10, name: "Overclock", icon: "zap", color: "#FB923C", tier: 3 },
  { key: "quantum", position: 11, name: "Quantum", icon: "atom", color: "#2F80FF", tier: 3 },
  { key: "sovereign", position: 12, name: "Sovereign", icon: "crown", color: "#7C3AED", tier: 4 },
  {
    key: "infinity",
    position: 13,
    name: "Infinity",
    icon: "infinity",
    color: "#38BDF8",
    tier: 5,
    gradient: "linear-gradient(90deg,#38BDF8,#818CF8,#C084FC)",
  },
] as const;

export const RANK_KEYS: readonly RankKey[] = RANKS.map((r) => r.key);
export const FIRST_RANK: RankKey = "nobis";
export const MAX_RANK: RankKey = "infinity";

const byKey = new Map(RANKS.map((r) => [r.key, r]));

export function isRankKey(value: string): value is RankKey {
  return byKey.has(value as RankKey);
}

export function getRank(key: string): RankDefinition | undefined {
  return byKey.get(key as RankKey);
}

export function getRankByPosition(position: number): RankDefinition | undefined {
  return RANKS.find((r) => r.position === position);
}

/** Next higher rank, or null at Infinity. */
export function nextRank(key: string): RankDefinition | null {
  const current = byKey.get(key as RankKey);
  if (!current) return null;
  return RANKS.find((r) => r.position === current.position + 1) ?? null;
}

// ─── API schemas (shared) ───────────────────────────────────────────────────
// Public: key only. Private: owner-only, identity from token (no id param).

export const publicRankSchema = z.object({ rank: z.string() });
export type PublicRank = z.infer<typeof publicRankSchema>;

export const meRankSchema = z.object({
  rank: z.string(),
  position: z.number().int(),
  xpTotal: z.number().int().nonnegative(),
  currentRankMinXp: z.number().int().nonnegative(),
  nextRank: z.string().nullable(),
  nextRankMinXp: z.number().int().nullable(),
  xpToNext: z.number().int().nullable(),
  progressPercent: z.number().min(0).max(100),
  isMaxRank: z.boolean(),
  achievedAt: z.string().nullable(),
  frozen: z.boolean(),
});
export type MeRank = z.infer<typeof meRankSchema>;

export const rankHistoryItemSchema = z.object({
  rank: z.string(),
  achievedAt: z.string(),
  xpAtTime: z.number().int().nonnegative(),
});
export type RankHistoryItem = z.infer<typeof rankHistoryItemSchema>;

export const rankActivityItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  label: z.string(),
  xp: z.number().int(),
  createdAt: z.string(),
  revoked: z.boolean(),
});
export type RankActivityItem = z.infer<typeof rankActivityItemSchema>;

export const rankRequirementItemSchema = z.object({
  source: z.string(),
  label: z.string(),
  perEventXp: z.number().int(),
  dailyCap: z.number().int(),
  usedToday: z.number().int(),
});
export const rankRequirementsSchema = z.object({
  nextRank: z.string().nullable(),
  xpRemaining: z.number().int().nullable(),
  ways: z.array(rankRequirementItemSchema),
});
export type RankRequirements = z.infer<typeof rankRequirementsSchema>;

export const rankSeenSchema = z.object({ rank: z.string() });
export type RankSeen = z.infer<typeof rankSeenSchema>;