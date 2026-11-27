import type { PoolClient } from "pg";
import type { ScoringConfig } from "./reputation.config";
import {
  applyCaps,
  computeProgress,
  deriveRank,
  idempotencyKey,
  ranksCrossed,
  type RankDefRow,
} from "./reputation.scoring";

export interface AwardInput {
  userId: string;
  source: string;
  sourceRef: string;
  xp: number;
  meta?: Record<string, unknown>;
  now?: Date;
}

export interface AwardResult {
  awarded: number;
  frozen: boolean;
  duplicate: boolean;
  rank: string;
  rankUp: boolean;
  crossed: string[];
}

/**
 * Award engine. All writes happen in the caller's transaction. Idempotent via a
 * unique (user_id, idempotency_key) and a row lock on member_progress so
 * concurrent events cannot double-award or skip a rank-up.
 */
export class ReputationService {
  constructor(
    private readonly config: ScoringConfig,
  ) {}

  async loadDefs(client: PoolClient): Promise<RankDefRow[]> {
    const res = await client.query<{ key: string; position: number; min_xp: string }>(
      "SELECT key, position, min_xp FROM reputation.rank_definitions WHERE active ORDER BY position",
    );
    return res.rows.map((r) => ({ key: r.key, position: r.position, min_xp: Number(r.min_xp) }));
  }

  async award(client: PoolClient, input: AwardInput): Promise<AwardResult> {
    const now = input.now ?? new Date();
    const key = idempotencyKey(input.source, input.sourceRef);
    const day = now.toISOString().slice(0, 10);

    // Ensure a progress row exists (lazy Nobis), then lock it.
    await client.query(
      "INSERT INTO reputation.member_progress (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [input.userId],
    );
    const pr = await client.query<{
      xp_total: string;
      rank_key: string;
      xp_frozen_until: Date | null;
    }>("SELECT xp_total, rank_key, xp_frozen_until FROM reputation.member_progress WHERE user_id = $1 FOR UPDATE", [
      input.userId,
    ]);
    const prog = pr.rows[0];
    const xpTotal = Number(prog.xp_total);
    const frozen = !!prog.xp_frozen_until && prog.xp_frozen_until.getTime() > now.getTime();
    if (frozen) {
      return { awarded: 0, frozen: true, duplicate: false, rank: prog.rank_key, rankUp: false, crossed: [] };
    }

    // Caps: per-source remaining and overall daily remaining.
    const used = await client.query<{ source: string; xp_awarded: string }>(
      "SELECT source, xp_awarded FROM reputation.xp_daily WHERE user_id = $1 AND day = $2",
      [input.userId, day],
    );
    const bySource = new Map(used.rows.map((r) => [r.source, Number(r.xp_awarded)]));
    const dailyUsed = used.rows.reduce((s, r) => s + Number(r.xp_awarded), 0);
    const sourceCap = this.sourceCap(input.source);
    const sourceRemaining = Math.max(0, sourceCap - (bySource.get(input.source) ?? 0));
    const dailyRemaining = Math.max(0, this.config.dailyCap - dailyUsed);
    const awarded = applyCaps(input.xp, sourceRemaining, dailyRemaining);

    // Idempotent insert; a duplicate is a silent no-op.
    const ins = await client.query<{ id: string }>(
      `INSERT INTO reputation.xp_events (id, user_id, source, source_ref, idempotency_key, xp, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id`,
      [crypto.randomUUID(), input.userId, input.source, input.sourceRef, key, awarded, JSON.stringify(input.meta ?? {})],
    );
    if (ins.rows.length === 0) {
      return { awarded: 0, frozen: false, duplicate: true, rank: prog.rank_key, rankUp: false, crossed: [] };
    }

    const newXpTotal = xpTotal + awarded;
    const defs = await this.loadDefs(client);
    const derived = deriveRank(newXpTotal, defs);
    const currentPos = defs.find((d) => d.key === prog.rank_key)?.position ?? 1;
    const derivedPos = defs.find((d) => d.key === derived)?.position ?? 1;
    const newRank = derivedPos >= currentPos ? derived : prog.rank_key; // permanent, no demotion
    const crossed = ranksCrossed(xpTotal, newXpTotal, defs).filter((d) => d.position > currentPos);

    await client.query(
      "UPDATE reputation.member_progress SET xp_total = $2, rank_key = $3, rank_achieved_at = COALESCE(rank_achieved_at, $4), updated_at = now() WHERE user_id = $1",
      [input.userId, newXpTotal, newRank, crossed.length > 0 ? now.toISOString() : null],
    );

    for (const d of crossed) {
      await client.query(
        `INSERT INTO reputation.rank_history (id, user_id, from_rank_key, to_rank_key, achieved_at, xp_at_time)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, to_rank_key) DO NOTHING`,
        [crypto.randomUUID(), input.userId, prog.rank_key, d.key, now.toISOString(), newXpTotal],
      );
    }

    await client.query(
      `INSERT INTO reputation.xp_daily (user_id, day, source, xp_awarded, event_count)
       VALUES ($1,$2,$3,$4,1)
       ON CONFLICT (user_id, day, source) DO UPDATE SET xp_awarded = reputation.xp_daily.xp_awarded + $4, event_count = reputation.xp_daily.event_count + 1`,
      [input.userId, day, input.source, awarded],
    );

    return { awarded, frozen: false, duplicate: false, rank: newRank, rankUp: crossed.length > 0, crossed: crossed.map((d) => d.key) };
  }

  private sourceCap(source: string): number {
    switch (source) {
      case "message":
        return this.config.message.dailyCap;
      case "reply":
        return this.config.reply.dailyCap;
      case "reaction":
        return this.config.reaction.dailyCap;
      default:
        return this.config.dailyCap;
    }
  }

  async getProgress(client: PoolClient, userId: string) {
    const defs = await this.loadDefs(client);
    const pr = await client.query<{ xp_total: string; rank_key: string; rank_achieved_at: Date | null; xp_frozen_until: Date | null }>(
      "SELECT xp_total, rank_key, rank_achieved_at, xp_frozen_until FROM reputation.member_progress WHERE user_id = $1",
      [userId],
    );
    const row = pr.rows[0];
    const xpTotal = row ? Number(row.xp_total) : 0;
    const progress = computeProgress(xpTotal, defs);
    return {
      ...progress,
      xpTotal,
      achievedAt: row?.rank_achieved_at ? row.rank_achieved_at.toISOString() : null,
      frozen: !!row?.xp_frozen_until && row.xp_frozen_until.getTime() > Date.now(),
    };
  }
}