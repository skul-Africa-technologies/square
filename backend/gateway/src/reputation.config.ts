/**
 * Rank scoring configuration. All values are tunable PLACEHOLDERS (observe real
 * data before tuning). Thresholds (min_xp per rank) live in the DB
 * (reputation.rank_definitions); only weights/caps live here. Env-overridable.
 */
export const SCORING_CONFIG = Symbol("SCORING_CONFIG");

export interface ScoringConfig {
  activeDay: { xp: number; minActions: number };
  streak: { xp: number; days: number; maxPerWeek: number };
  message: { xp: number; minWords: number; minChars: number; dailyCap: number };
  reply: { xp: number; dailyCap: number };
  reaction: { xp: number; dailyCap: number; perPairCap: number };
  event: { xp: number };
  project: { xp: number };
  community: { xp: number; maxCommunities: number; delayHours: number };
  profile: { xp: number };
  badge: { xp: number };
  dailyCap: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  activeDay: { xp: 5, minActions: 3 },
  streak: { xp: 15, days: 7, maxPerWeek: 1 },
  message: { xp: 1, minWords: 3, minChars: 15, dailyCap: 20 },
  reply: { xp: 2, dailyCap: 20 },
  reaction: { xp: 1, dailyCap: 30, perPairCap: 5 },
  event: { xp: 25 },
  project: { xp: 50 },
  community: { xp: 5, maxCommunities: 5, delayHours: 24 },
  profile: { xp: 20 },
  badge: { xp: 30 },
  dailyCap: 150,
};

function num(value: string | undefined, fallback: number): number {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Load scoring config with env overrides (e.g. RANKS_XP_MESSAGE). */
export function loadScoringConfig(env: NodeJS.ProcessEnv = process.env): ScoringConfig {
  return {
    activeDay: { xp: num(env.RANKS_XP_ACTIVE_DAY, DEFAULT_SCORING.activeDay.xp), minActions: DEFAULT_SCORING.activeDay.minActions },
    streak: { xp: num(env.RANKS_XP_STREAK, DEFAULT_SCORING.streak.xp), days: DEFAULT_SCORING.streak.days, maxPerWeek: DEFAULT_SCORING.streak.maxPerWeek },
    message: { ...DEFAULT_SCORING.message, xp: num(env.RANKS_XP_MESSAGE, DEFAULT_SCORING.message.xp), dailyCap: num(env.RANKS_CAP_MESSAGE, DEFAULT_SCORING.message.dailyCap) },
    reply: { ...DEFAULT_SCORING.reply, xp: num(env.RANKS_XP_REPLY, DEFAULT_SCORING.reply.xp), dailyCap: num(env.RANKS_CAP_REPLY, DEFAULT_SCORING.reply.dailyCap) },
    reaction: { ...DEFAULT_SCORING.reaction, xp: num(env.RANKS_XP_REACTION, DEFAULT_SCORING.reaction.xp), dailyCap: num(env.RANKS_CAP_REACTION, DEFAULT_SCORING.reaction.dailyCap) },
    event: { xp: num(env.RANKS_XP_EVENT, DEFAULT_SCORING.event.xp) },
    project: { xp: num(env.RANKS_XP_PROJECT, DEFAULT_SCORING.project.xp) },
    community: { ...DEFAULT_SCORING.community, xp: num(env.RANKS_XP_COMMUNITY, DEFAULT_SCORING.community.xp) },
    profile: { xp: num(env.RANKS_XP_PROFILE, DEFAULT_SCORING.profile.xp) },
    badge: { xp: num(env.RANKS_XP_BADGE, DEFAULT_SCORING.badge.xp) },
    dailyCap: num(env.RANKS_DAILY_CAP, DEFAULT_SCORING.dailyCap),
  };
}