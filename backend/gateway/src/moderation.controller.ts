import { randomUUID } from "node:crypto";
import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService, RedisRateLimiter } from "@square/kernel";
import { z } from "zod";

type ModerationRequest = FastifyRequest & { user?: AuthenticatedUser };
type ReportTarget = "message" | "post" | "comment" | "user" | "community" | "entry" | "item";
type ReportAction = "dismiss" | "delete_content" | "timeout" | "ban";

const reportSchema = z.object({
  targetKind: z.enum(["message", "post", "comment", "user", "community", "entry", "item"]),
  targetId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(80),
  details: z.string().max(2_000).optional(),
}).strict();
const userReportSchema = z.object({
  username: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(1).max(80),
  note: z.string().max(2_000).optional(),
}).strict();
const resolveReportSchema = z.object({
  action: z.enum(["dismiss", "delete_content", "timeout", "ban"]),
  note: z.string().max(2_000).optional(),
}).strict();
const restrictionSchema = z.object({
  until: z.iso.datetime(),
  reason: z.string().trim().min(1).max(500),
}).strict();
const banSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  until: z.iso.datetime().optional(),
}).strict();
const reportStatusSchema = z.enum(["pending", "resolved", "dismissed"]);

function parseRequest<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiException(400, "validation_failed", issue?.message ?? "Invalid request", issue?.path.join(".") || null);
  }
  return parsed.data;
}

@Controller()
export class ModerationController {
  constructor(
    private readonly database: DatabaseService,
    private readonly rateLimiter: RedisRateLimiter,
  ) {}

  private requireUser(request: ModerationRequest) {
    const userId = request.user?.id;
    if (!userId) throw new ApiException(401, "unauthenticated", "Sign in to continue");
    return userId;
  }

  private async moderatorCommunity(slugOrId: string, userId: string) {
    const result = await this.database.pool.query<{ id: string; role: string }>(
      `SELECT community.id,membership.role
       FROM communities.communities community
       JOIN communities.memberships membership ON membership.community_id=community.id
       WHERE (community.slug=$1 OR community.id=$1) AND community.deleted_at IS NULL
         AND membership.user_id=$2`,
      [slugOrId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new ApiException(404, "not_found", "Community not found or you are not a member");
    if (row.role !== "owner" && row.role !== "moderator") {
      throw new ApiException(403, "community_forbidden", "Moderator access is required");
    }
    return row.id;
  }

  private async findReportTarget(kind: ReportTarget, targetId: string, reporterId: string) {
    switch (kind) {
      case "message":
        return this.database.pool.query<{ community_id: string; reported_user_id: string }>(
          `SELECT asset.community_id,message.author_id AS reported_user_id
           FROM chat.messages message
           JOIN assets.assets asset ON asset.id=message.asset_id
           WHERE message.id=$1 AND message.deleted_at IS NULL AND asset.deleted_at IS NULL`,
          [targetId],
        );
      case "post":
        return this.database.pool.query<{ community_id: string; reported_user_id: string }>(
          `SELECT asset.community_id,post.author_id AS reported_user_id
           FROM feeds.posts post JOIN assets.assets asset ON asset.id=post.asset_id
           WHERE post.id=$1 AND post.deleted_at IS NULL AND asset.deleted_at IS NULL`,
          [targetId],
        );
      case "comment":
        return this.database.pool.query<{ community_id: string; reported_user_id: string }>(
          `SELECT asset.community_id,comment.author_id AS reported_user_id
           FROM feeds.comments comment
           JOIN feeds.posts post ON post.id=comment.post_id
           JOIN assets.assets asset ON asset.id=post.asset_id
           WHERE comment.id=$1 AND comment.deleted_at IS NULL AND post.deleted_at IS NULL`,
          [targetId],
        );
      case "entry":
        return this.database.pool.query<{ community_id: string; reported_user_id: string }>(
          `SELECT asset.community_id,entry.author_id AS reported_user_id
           FROM lists.entries entry JOIN assets.assets asset ON asset.id=entry.asset_id
           WHERE entry.id=$1 AND entry.deleted_at IS NULL`,
          [targetId],
        );
      case "item":
        return this.database.pool.query<{ community_id: string; reported_user_id: string }>(
          `SELECT asset.community_id,item.owner_id AS reported_user_id
           FROM boards.items item JOIN assets.assets asset ON asset.id=item.asset_id
           WHERE item.id=$1 AND item.deleted_at IS NULL`,
          [targetId],
        );
      case "community":
        return this.database.pool.query<{ community_id: string; reported_user_id: string | null }>(
          `SELECT community.id AS community_id,NULL::text AS reported_user_id
           FROM communities.communities community
           WHERE (community.id=$1 OR community.slug=$1) AND community.deleted_at IS NULL`,
          [targetId],
        );
      case "user":
        return this.database.pool.query<{ community_id: string; reported_user_id: string }>(
          `SELECT shared.community_id,profile.id AS reported_user_id
           FROM users.profiles profile
           JOIN communities.memberships target ON target.user_id=profile.id
           JOIN communities.memberships shared ON shared.community_id=target.community_id
             AND shared.user_id=$2
           WHERE (profile.id=$1 OR lower(profile.username)=lower($1))
             AND profile.deleted_at IS NULL AND profile.id<>$2
           ORDER BY shared.community_id
           LIMIT 1`,
          [targetId, reporterId],
        );
    }
  }

  @Post("reports")
  async createReport(@Req() request: ModerationRequest, @Body() body: unknown) {
    const reporterId = this.requireUser(request);
    const input = parseRequest(reportSchema, body);
    const limited = await this.rateLimiter.consume("moderation:report", reporterId, { limit: 5, windowMs: 60 * 60_000 });
    if (!limited.allowed) {
      throw new ApiException(429, "rate_limited", "Too many reports; try again later");
    }
    const target = await this.findReportTarget(input.targetKind, input.targetId, reporterId);
    const row = target.rows[0];
    if (!row) throw new ApiException(404, "not_found", "Report target not found");
    if (row.reported_user_id === reporterId) throw new ApiException(400, "validation_failed", "You cannot report yourself", "targetId");
    const id = randomUUID();
    await this.database.pool.query(
      `INSERT INTO moderation.reports
         (id,community_id,reporter_id,target_kind,target_id,reported_user_id,reason,details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, row.community_id, reporterId, input.targetKind, input.targetId, row.reported_user_id, input.reason, input.details ?? ""],
    );
    return { id, status: "pending" as const };
  }

  @Post("me/reports")
  async reportUser(@Req() request: ModerationRequest, @Body() body: unknown) {
    const input = parseRequest(userReportSchema, body);
    return this.createReport(request, {
      targetKind: "user",
      targetId: input.username.replace(/^#/, ""),
      reason: input.reason,
      details: input.note,
    });
  }

  @Get("communities/:slug/reports")
  async listReports(
    @Param("slug") slug: string,
    @Req() request: ModerationRequest,
    @Query("status") statusValue?: string,
    @Query("cursor") cursor?: string,
  ) {
    const communityId = await this.moderatorCommunity(slug, this.requireUser(request));
    const parsedStatus = statusValue ? reportStatusSchema.safeParse(statusValue) : undefined;
    if (parsedStatus && !parsedStatus.success) throw new ApiException(400, "validation_failed", "Invalid report status", "status");
    const status = parsedStatus?.success ? parsedStatus.data : "pending";
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT report.id,report.target_kind,report.target_id,report.reported_user_id,
              report.reason,report.details,report.status,report.created_at,
              reporter.username AS reporter_username,
              target.username AS reported_username
       FROM moderation.reports report
       JOIN users.profiles reporter ON reporter.id=report.reporter_id
       LEFT JOIN users.profiles target ON target.id=report.reported_user_id
       WHERE report.community_id=$1 AND report.status=$2
         AND ($3::text IS NULL OR (report.created_at,report.id) < (
           SELECT previous.created_at,previous.id FROM moderation.reports previous WHERE previous.id=$3 AND previous.community_id=$1
         ))
       ORDER BY report.created_at DESC,report.id DESC
       LIMIT 51`,
      [communityId, status, cursor || null],
    );
    const items = result.rows.slice(0, 50);
    return { items, nextCursor: result.rows.length > 50 ? String(items.at(-1)?.id) : null };
  }

  @Post("reports/:id/resolve")
  async resolveReport(@Param("id") id: string, @Req() request: ModerationRequest, @Body() body: unknown) {
    const actorId = this.requireUser(request);
    const input = parseRequest(resolveReportSchema, body);
    await this.database.transaction(async client => {
      const reportResult = await client.query<{
        community_id: string | null;
        reporter_id: string;
        target_kind: ReportTarget;
        target_id: string;
        reported_user_id: string | null;
        reason: string;
      }>(
        "SELECT community_id,reporter_id,target_kind,target_id,reported_user_id,reason FROM moderation.reports WHERE id=$1 AND status='pending' FOR UPDATE",
        [id],
      );
      const report = reportResult.rows[0];
      if (!report?.community_id) throw new ApiException(404, "not_found", "Pending report not found");
      const moderator = await client.query<{ role: string }>(
        "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2 FOR UPDATE",
        [report.community_id, actorId],
      );
      if (!moderator.rows[0] || !["owner", "moderator"].includes(moderator.rows[0].role)) {
        throw new ApiException(403, "community_forbidden", "Moderator access is required");
      }

      let nextStatus: "resolved" | "dismissed" = input.action === "dismiss" ? "dismissed" : "resolved";
      if (input.action === "delete_content") {
        await this.deleteReportedContent(client, report.target_kind, report.target_id, report.community_id);
      } else if (input.action === "timeout" || input.action === "ban") {
        if (!report.reported_user_id) throw new ApiException(400, "validation_failed", "This report has no actionable user");
        await this.restrictMember(
          client,
          report.community_id,
          report.reported_user_id,
          input.action,
          input.note || report.reason,
          actorId,
          moderator.rows[0].role,
        );
      }
      await client.query(
        `UPDATE moderation.reports
         SET status=$1,resolution_action=$2,resolution_note=$3,resolved_by=$4,resolved_at=now()
         WHERE id=$5`,
        [nextStatus, input.action, input.note ?? "", actorId, id],
      );
      await this.audit(client, report.community_id, actorId, `report.${input.action}`, report.target_kind, report.target_id, report.reported_user_id, {
        reportId: id,
        note: input.note ?? "",
      });
    });
    return { ok: true };
  }

  @Get("communities/:slug/timeouts")
  async listTimeouts(@Param("slug") slug: string, @Req() request: ModerationRequest) {
    const communityId = await this.moderatorCommunity(slug, this.requireUser(request));
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT restriction.user_id,profile.username,restriction.reason,restriction.created_at,
              restriction.expires_at,restriction.created_by
       FROM communities.member_restrictions restriction
       JOIN users.profiles profile ON profile.id=restriction.user_id
       WHERE restriction.community_id=$1 AND restriction.restriction='timeout'
         AND restriction.expires_at>now()
       ORDER BY restriction.expires_at,restriction.user_id`,
      [communityId],
    );
    return { items: result.rows };
  }

  @Post("communities/:slug/timeouts/:userId")
  async createTimeout(
    @Param("slug") slug: string,
    @Param("userId") userId: string,
    @Req() request: ModerationRequest,
    @Body() body: unknown,
  ) {
    const actorId = this.requireUser(request);
    const input = parseRequest(restrictionSchema, body);
    if (Date.parse(input.until) <= Date.now()) {
      throw new ApiException(400, "validation_failed", "Timeout expiry must be in the future", "until");
    }
    const communityId = await this.moderatorCommunity(slug, actorId);
    await this.database.transaction(async client => {
      const actor = await client.query<{ role: string }>(
        "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2 FOR UPDATE",
        [communityId, actorId],
      );
      if (!actor.rows[0] || !["owner", "moderator"].includes(actor.rows[0].role)) {
        throw new ApiException(403, "community_forbidden", "Moderator access is required");
      }
      const target = await client.query<{ role: string }>(
        "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2 FOR UPDATE",
        [communityId, userId],
      );
      if (!target.rows[0]) throw new ApiException(404, "not_found", "Community member not found");
      if (userId === actorId || target.rows[0].role === "owner" ||
          (actor.rows[0]?.role === "moderator" && target.rows[0].role !== "member")) {
        throw new ApiException(403, "community_forbidden", "You cannot timeout this member");
      }
      await client.query(
        `INSERT INTO communities.member_restrictions
           (community_id,user_id,restriction,expires_at,reason,created_by)
         VALUES ($1,$2,'timeout',$3,$4,$5)
         ON CONFLICT (community_id,user_id,restriction) DO UPDATE
         SET expires_at=EXCLUDED.expires_at,reason=EXCLUDED.reason,created_by=EXCLUDED.created_by,created_at=now()`,
        [communityId, userId, input.until, input.reason, actorId],
      );
      await this.audit(client, communityId, actorId, "member.timeout", "user", userId, userId, {
        until: input.until,
        reason: input.reason,
      });
    });
    return { ok: true };
  }

  @Delete("communities/:slug/timeouts/:userId")
  async removeTimeout(@Param("slug") slug: string, @Param("userId") userId: string, @Req() request: ModerationRequest) {
    const actorId = this.requireUser(request);
    const communityId = await this.moderatorCommunity(slug, actorId);
    await this.database.transaction(async client => {
      const actor = await client.query<{ role: string }>(
        "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2 FOR UPDATE",
        [communityId, actorId],
      );
      if (!actor.rows[0] || !["owner", "moderator"].includes(actor.rows[0].role)) {
        throw new ApiException(403, "community_forbidden", "Moderator access is required");
      }
      const removed = await client.query(
        `DELETE FROM communities.member_restrictions
         WHERE community_id=$1 AND user_id=$2 AND restriction='timeout'
         RETURNING 1`,
        [communityId, userId],
      );
      if (!removed.rowCount) throw new ApiException(404, "not_found", "Timeout not found");
      await this.audit(client, communityId, actorId, "member.timeout_lifted", "user", userId, userId, {});
    });
    return { ok: true };
  }

  @Get("communities/:slug/bans")
  async listBans(@Param("slug") slug: string, @Req() request: ModerationRequest) {
    const communityId = await this.moderatorCommunity(slug, this.requireUser(request));
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT restriction.user_id,profile.username,restriction.reason,restriction.created_at,
              restriction.expires_at,restriction.created_by
       FROM communities.member_restrictions restriction
       JOIN users.profiles profile ON profile.id=restriction.user_id
       WHERE restriction.community_id=$1 AND restriction.restriction='banned'
         AND (restriction.expires_at IS NULL OR restriction.expires_at>now())
       ORDER BY restriction.created_at DESC,restriction.user_id`,
      [communityId],
    );
    return { items: result.rows };
  }

  @Post("communities/:slug/bans")
  async createBan(
    @Param("slug") slug: string,
    @Req() request: ModerationRequest,
    @Body() body: unknown,
  ) {
    const actorId = this.requireUser(request);
    const input = parseRequest(z.object({
      userId: z.string().trim().min(1).max(128),
      reason: banSchema.shape.reason,
      until: banSchema.shape.until,
    }).strict(), body);
    if (input.until && Date.parse(input.until) <= Date.now()) {
      throw new ApiException(400, "validation_failed", "Ban expiry must be in the future", "until");
    }
    const communityId = await this.moderatorCommunity(slug, actorId);
    await this.database.transaction(async client => {
      const actor = await client.query<{ role: string }>(
        "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2 FOR UPDATE",
        [communityId, actorId],
      );
      if (!actor.rows[0] || !["owner", "moderator"].includes(actor.rows[0].role)) {
        throw new ApiException(403, "community_forbidden", "Moderator access is required");
      }
      const profile = await client.query<{ id: string }>(
        `SELECT profile.id
         FROM users.profiles profile
         WHERE profile.id=$1 AND profile.deleted_at IS NULL
         FOR UPDATE`,
        [input.userId],
      );
      if (!profile.rows[0]) throw new ApiException(404, "not_found", "User not found");
      const target = await client.query<{ role: string }>(
        "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2 FOR UPDATE",
        [communityId, input.userId],
      );
      const targetRole = target.rows[0]?.role ?? null;
      if (input.userId === actorId || targetRole === "owner" ||
          (actor.rows[0]?.role === "moderator" && targetRole !== null && targetRole !== "member")) {
        throw new ApiException(403, "community_forbidden", "You cannot ban this user");
      }
      await client.query(
        `INSERT INTO communities.member_restrictions
           (community_id,user_id,restriction,expires_at,reason,created_by)
         VALUES ($1,$2,'banned',$3,$4,$5)
         ON CONFLICT (community_id,user_id,restriction) DO UPDATE
         SET expires_at=EXCLUDED.expires_at,reason=EXCLUDED.reason,created_by=EXCLUDED.created_by,created_at=now()`,
        [communityId, input.userId, input.until ?? null, input.reason, actorId],
      );
      const removed = await client.query(
        "DELETE FROM communities.memberships WHERE community_id=$1 AND user_id=$2 RETURNING 1",
        [communityId, input.userId],
      );
      if (removed.rowCount) {
        await client.query(
          "UPDATE communities.communities SET member_count=GREATEST(member_count-1,0) WHERE id=$1",
          [communityId],
        );
      }
      await this.audit(client, communityId, actorId, "member.banned", "user", input.userId, input.userId, {
        reason: input.reason,
        until: input.until ?? null,
      });
    });
    return { ok: true };
  }

  @Delete("communities/:slug/bans/:userId")
  async removeBan(@Param("slug") slug: string, @Param("userId") userId: string, @Req() request: ModerationRequest) {
    const actorId = this.requireUser(request);
    const communityId = await this.moderatorCommunity(slug, actorId);
    await this.database.transaction(async client => {
      const actor = await client.query<{ role: string }>(
        "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2 FOR UPDATE",
        [communityId, actorId],
      );
      if (!actor.rows[0] || !["owner", "moderator"].includes(actor.rows[0].role)) {
        throw new ApiException(403, "community_forbidden", "Moderator access is required");
      }
      const removed = await client.query(
        `DELETE FROM communities.member_restrictions
         WHERE community_id=$1 AND user_id=$2 AND restriction='banned'
         RETURNING 1`,
        [communityId, userId],
      );
      if (!removed.rowCount) throw new ApiException(404, "not_found", "Ban not found");
      await this.audit(client, communityId, actorId, "member.ban_lifted", "user", userId, userId, {});
    });
    return { ok: true };
  }

  @Get("communities/:slug/audit-log")
  async communityAuditLog(
    @Param("slug") slug: string,
    @Req() request: ModerationRequest,
    @Query("cursor") cursor?: string,
  ) {
    const communityId = await this.moderatorCommunity(slug, this.requireUser(request));
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT log.id,log.action,log.target_kind,log.target_id,log.target_user_id,
              log.metadata,log.created_at,actor.username AS actor_username,
              target.username AS target_username
       FROM moderation.community_audit_log log
       JOIN users.profiles actor ON actor.id=log.actor_id
       LEFT JOIN users.profiles target ON target.id=log.target_user_id
       WHERE log.community_id=$1
         AND ($2::text IS NULL OR (log.created_at,log.id) < (
           SELECT previous.created_at,previous.id FROM moderation.community_audit_log previous
           WHERE previous.id=$2 AND previous.community_id=$1
         ))
       ORDER BY log.created_at DESC,log.id DESC
       LIMIT 51`,
      [communityId, cursor || null],
    );
    const items = result.rows.slice(0, 50);
    return { items, nextCursor: result.rows.length > 50 ? String(items.at(-1)?.id) : null };
  }

  private async restrictMember(
    client: { query: <T = unknown>(queryText: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }> },
    communityId: string,
    userId: string,
    action: "timeout" | "ban",
    reason: string,
    actorId: string,
    actorRole: string,
  ) {
    const target = await client.query<{ role: string | null }>(
      "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2 FOR UPDATE",
      [communityId, userId],
    );
    const targetRole = target.rows[0]?.role ?? null;
    if (userId === actorId || targetRole === "owner" ||
        (actorRole === "moderator" && targetRole !== "member")) {
      throw new ApiException(403, "community_forbidden", "You cannot restrict this user");
    }
    const expiresAt = action === "timeout" ? new Date(Date.now() + 24 * 60 * 60_000).toISOString() : null;
    await client.query(
      `INSERT INTO communities.member_restrictions
         (community_id,user_id,restriction,expires_at,reason,created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (community_id,user_id,restriction) DO UPDATE
       SET expires_at=EXCLUDED.expires_at,reason=EXCLUDED.reason,created_by=EXCLUDED.created_by,created_at=now()`,
      [communityId, userId, action === "ban" ? "banned" : "timeout", expiresAt, reason, actorId],
    );
    if (action === "ban") {
      const removed = await client.query(
        "DELETE FROM communities.memberships WHERE community_id=$1 AND user_id=$2 RETURNING 1",
        [communityId, userId],
      );
      if (removed.rowCount) {
        await client.query(
          "UPDATE communities.communities SET member_count=GREATEST(member_count-1,0) WHERE id=$1",
          [communityId],
        );
      }
    }
  }

  private async deleteReportedContent(
    client: { query: <T = unknown>(queryText: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }> },
    kind: ReportTarget,
    targetId: string,
    communityId: string,
  ) {
    let result: { rows: unknown[]; rowCount: number | null };
    switch (kind) {
      case "message":
        result = await client.query(
          `UPDATE chat.messages message SET deleted_at=now(),body=''
           FROM assets.assets asset
           WHERE message.id=$1 AND message.asset_id=asset.id AND asset.community_id=$2
             AND message.deleted_at IS NULL RETURNING message.id`,
          [targetId, communityId],
        );
        break;
      case "post":
        result = await client.query(
          `UPDATE feeds.posts post SET deleted_at=now()
           FROM assets.assets asset
           WHERE post.id=$1 AND post.asset_id=asset.id AND asset.community_id=$2
             AND post.deleted_at IS NULL RETURNING post.id`,
          [targetId, communityId],
        );
        break;
      case "comment":
        result = await client.query(
          `UPDATE feeds.comments comment SET deleted_at=now()
           FROM feeds.posts post JOIN assets.assets asset ON asset.id=post.asset_id
           WHERE comment.id=$1 AND comment.post_id=post.id AND asset.community_id=$2
             AND comment.deleted_at IS NULL RETURNING comment.id`,
          [targetId, communityId],
        );
        break;
      case "entry":
        result = await client.query(
          `UPDATE lists.entries entry SET deleted_at=now()
           FROM assets.assets asset
           WHERE entry.id=$1 AND entry.asset_id=asset.id AND asset.community_id=$2
             AND entry.deleted_at IS NULL RETURNING entry.id`,
          [targetId, communityId],
        );
        break;
      case "item":
        result = await client.query(
          `UPDATE boards.items item SET deleted_at=now()
           FROM assets.assets asset
           WHERE item.id=$1 AND item.asset_id=asset.id AND asset.community_id=$2
             AND item.deleted_at IS NULL RETURNING item.id`,
          [targetId, communityId],
        );
        break;
      default:
        throw new ApiException(400, "validation_failed", "This report target cannot be deleted as content");
    }
    if (!result.rowCount) throw new ApiException(404, "not_found", "Report target no longer exists");
  }

  private async audit(
    client: { query: <T = unknown>(queryText: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }> },
    communityId: string,
    actorId: string,
    action: string,
    targetKind: string,
    targetId: string,
    targetUserId: string | null,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO moderation.community_audit_log
         (id,community_id,actor_id,action,target_kind,target_id,target_user_id,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [randomUUID(), communityId, actorId, action, targetKind, targetId, targetUserId, JSON.stringify(metadata)],
    );
  }
}
