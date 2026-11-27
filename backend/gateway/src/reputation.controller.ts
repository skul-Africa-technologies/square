import { Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService, Public, RedisService } from "@square/kernel";
import type { FastifyRequest } from "fastify";
import { ReputationService } from "./reputation.service";
import { SCORING_CONFIG, type ScoringConfig } from "./reputation.config";

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

function authenticatedUser(request: FastifyRequest): AuthenticatedUser {
  const user = (request as RequestWithUser).user;
  if (!user) throw new ApiException(401, "unauthenticated", "Sign in to continue");
  return user;
}

function normalizeUsername(raw: string): string {
  return raw.replace(/^#/, "").normalize("NFC").toLowerCase();
}

const SOURCE_LABELS: Record<string, string> = {
  message: "Message",
  reply: "Reply",
  reaction: "Reaction",
  event: "Event check-in",
  project: "Project",
  community: "Community",
  profile: "Profile",
  badge: "Badge",
  active_day: "Active day",
  streak: "Streak",
};

function label(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

@Controller()
@ApiTags("rank & reputation")
export class ReputationController {
  constructor(
    private readonly reputation: ReputationService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(SCORING_CONFIG) private readonly config: ScoringConfig,
  ) {}

  @Get("users/:username/rank")
  @Public()
  @ApiOperation({ summary: "Public rank key for a member (key only, no progress)" })
  @ApiResponse({ status: 200, description: "Rank key" })
  async publicRank(@Param("username") username: string) {
    const uname = normalizeUsername(username);
    const res = await this.database.pool.query<{ id: string }>(
      "SELECT id FROM users.profiles WHERE username = $1 AND deleted_at IS NULL",
      [uname],
    );
    if (!res.rows[0]) throw new ApiException(404, "not_found", "User not found");
    return { rank: await this.rankKey(res.rows[0].id) };
  }

  @Get("me/rank")
  @ApiOperation({ summary: "Current user's rank, progress and next-rank info" })
  async myRank(@Req() request: FastifyRequest) {
    const user = authenticatedUser(request);
    return this.database.transaction((client) => this.reputation.getProgress(client, user.id));
  }

  @Get("me/rank/history")
  @ApiOperation({ summary: "Current user's rank history (newest first)" })
  async myRankHistory(@Req() request: FastifyRequest) {
    const user = authenticatedUser(request);
    const res = await this.database.pool.query(
      `SELECT to_rank_key, achieved_at, xp_at_time
       FROM reputation.rank_history WHERE user_id = $1 ORDER BY achieved_at DESC`,
      [user.id],
    );
    return {
      history: res.rows.map((r) => ({
        rank: r.to_rank_key,
        achievedAt: r.achieved_at instanceof Date ? r.achieved_at.toISOString() : r.achieved_at,
        xpAtTime: Number(r.xp_at_time),
      })),
    };
  }

  @Get("me/rank/activity")
  @ApiOperation({ summary: "Current user's recent XP activity" })
  async myRankActivity(@Req() request: FastifyRequest) {
    const user = authenticatedUser(request);
    const res = await this.database.pool.query(
      `SELECT e.id, e.source, e.xp, e.created_at,
              EXISTS (SELECT 1 FROM reputation.xp_revocations r WHERE r.event_id = e.id) AS revoked
       FROM reputation.xp_events e WHERE e.user_id = $1 ORDER BY e.created_at DESC LIMIT 50`,
      [user.id],
    );
    return {
      activity: res.rows.map((r) => ({
        id: r.id,
        source: r.source,
        label: label(r.source),
        xp: Number(r.xp),
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        revoked: Boolean(r.revoked),
      })),
    };
  }

  @Get("me/rank/requirements")
  @ApiOperation({ summary: "Ways to earn XP plus the current user's standing" })
  async myRankRequirements(@Req() request: FastifyRequest) {
    const user = authenticatedUser(request);
    const day = new Date().toISOString().slice(0, 10);
    return this.database.transaction(async (client) => {
      const progress = await this.reputation.getProgress(client, user.id);
      const used = await client.query<{ source: string; xp_awarded: string }>(
        "SELECT source, xp_awarded FROM reputation.xp_daily WHERE user_id = $1 AND day = $2",
        [user.id, day],
      );
      const usedBySource = new Map(used.rows.map((r) => [r.source, Number(r.xp_awarded)]));
      const ways = [
        { source: "message", perEventXp: this.config.message.xp, dailyCap: this.config.message.dailyCap },
        { source: "reply", perEventXp: this.config.reply.xp, dailyCap: this.config.reply.dailyCap },
        { source: "reaction", perEventXp: this.config.reaction.xp, dailyCap: this.config.reaction.dailyCap },
        { source: "event", perEventXp: this.config.event.xp, dailyCap: this.config.dailyCap },
        { source: "project", perEventXp: this.config.project.xp, dailyCap: this.config.dailyCap },
        { source: "community", perEventXp: this.config.community.xp, dailyCap: this.config.dailyCap },
        { source: "profile", perEventXp: this.config.profile.xp, dailyCap: this.config.dailyCap },
        { source: "badge", perEventXp: this.config.badge.xp, dailyCap: this.config.dailyCap },
        { source: "active_day", perEventXp: this.config.activeDay.xp, dailyCap: this.config.dailyCap },
        { source: "streak", perEventXp: this.config.streak.xp, dailyCap: this.config.dailyCap },
      ].map((w) => ({
        source: w.source,
        label: label(w.source),
        perEventXp: w.perEventXp,
        dailyCap: w.dailyCap,
        usedToday: usedBySource.get(w.source) ?? 0,
      }));
      return {
        nextRank: progress.nextRank,
        xpRemaining: progress.xpToNext,
        ways,
      };
    });
  }

  @Post("me/rank/seen")
  @ApiOperation({ summary: "Mark the current rank-up celebration as seen" })
  async markSeen(@Req() request: FastifyRequest) {
    const user = authenticatedUser(request);
    const key = await this.rankKey(user.id);
    await this.redis.client.set(`rank:seen:${user.id}`, key);
    return { rank: key };
  }

  private async rankKey(userId: string): Promise<string> {
    const res = await this.database.pool.query<{ rank_key: string }>(
      "SELECT rank_key FROM reputation.member_progress WHERE user_id = $1",
      [userId],
    );
    return res.rows[0]?.rank_key ?? "nobis";
  }
}