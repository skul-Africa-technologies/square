import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService, Public } from "@square/kernel";
import { ASSET_CATALOG, DEFAULT_ASSETS, ASSET_CATEGORY_ORDER } from "@square/shared";
import { z } from "zod";

type PlatformRequest = FastifyRequest & { user?: AuthenticatedUser };

const createCommunitySchema = z.object({
  name: z.string().trim().min(1).max(60),
  blurb: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  schoolName: z.string().max(200).optional(),
  isPublic: z.boolean().optional(),
  joinPolicy: z.enum(["open", "request", "invite-only"]).optional(),
}).strict();
const updateCommunitySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  blurb: z.string().max(200).optional(),
  description: z.string().max(2_000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  schoolName: z.string().max(200).optional(),
  avatar: z.url().optional(),
  bannerUrl: z.url().optional(),
  isPublic: z.boolean().optional(),
  joinPolicy: z.enum(["open", "request", "invite-only"]).optional(),
}).strict().refine(input => Object.keys(input).length > 0, "Provide at least one field to update");
const communityRoleSchema = z.enum(["owner", "moderator", "member"]);
const memberRoleSchema = z.enum(["moderator", "member"]);
const joinRequestDecisionSchema = z.object({ approve: z.boolean() }).strict();
const assetPermissionsSchema = z.object({
  canRead: z.array(communityRoleSchema).min(1).max(3),
  canPost: z.array(communityRoleSchema).min(1).max(3),
  canPin: z.array(communityRoleSchema).min(1).max(3),
}).strict().refine(permissions =>
  permissions.canRead.includes("owner") &&
  permissions.canPost.includes("owner") &&
  permissions.canPin.includes("owner") &&
  new Set(permissions.canRead).size === permissions.canRead.length &&
  new Set(permissions.canPost).size === permissions.canPost.length &&
  new Set(permissions.canPin).size === permissions.canPin.length,
  "Permission lists must be unique and keep owner access",
);
const memberRoleRequestSchema = z.object({ role: memberRoleSchema }).strict();
const assetOrderSchema = z.object({ assetIds: z.array(z.string().min(1).max(128)).min(1).max(100) }).strict();
const exploreQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  sort: z.enum(["top", "new"]).default("top"),
  school: z.string().trim().max(200).optional(),
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();
const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(500).optional(),
  expiresIn: z.number().int().min(60).max(90 * 24 * 60 * 60).default(7 * 24 * 60 * 60),
}).strict().default({ expiresIn: 7 * 24 * 60 * 60 });

function inviteCodeHash(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

@Controller()
export class PlatformController {
  constructor(private readonly database: DatabaseService) {}

  @Get("asset-catalog")
  async catalog(@Req() request: PlatformRequest) {
    if (!request.user) throw new ApiException(401, "unauthenticated", "Sign in to continue");
    return [...DEFAULT_ASSETS, ...ASSET_CATALOG];
  }

  @Post("communities")
  async createCommunity(@Req() request: PlatformRequest, @Body() body: unknown) {
    const input = createCommunitySchema.parse(body);
    const name = input.name;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    if (!slug) throw new ApiException(400, "validation_failed", "Community slug is invalid", "name");
    const id = randomUUID();
    try {
      await this.database.transaction(async (client) => {
        await client.query(
          `INSERT INTO communities.communities (id,slug,name,blurb,description,category,school_name,avatar,is_public,join_policy,member_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)`,
          [id, slug, name, input.blurb ?? "", input.description ?? "",
            input.category ?? "Community", input.schoolName ?? "", name.slice(0, 2).toUpperCase(),
            input.isPublic !== false, input.joinPolicy ?? "open"],
        );
        await client.query(
          "INSERT INTO communities.memberships (community_id,user_id,role) VALUES ($1,$2,'owner')",
          [id, request.user?.id],
        );
        for (const [order, entry] of DEFAULT_ASSETS.entries()) {
          await client.query(
            `INSERT INTO assets.assets (
              id,community_id,catalog_key,name,slug,kind,category,description,is_default,
              hidden_from_members,can_read_roles,can_post_roles,can_pin_roles,is_public,sort_order
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,true,$13)`,
            [randomUUID(), id, entry.key, entry.name, entry.key, entry.kind, entry.category,
              entry.description, entry.hiddenFromMembers ?? false,
              entry.permissions.canRead, entry.permissions.canPost, entry.permissions.canPin, order],
          );
        }
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        throw new ApiException(409, "already_exists", "A community with that name already exists");
      }
      throw error;
    }
    return this.database.pool.query<Record<string, unknown>>(
      "SELECT id,slug,name,blurb,category,school_name,avatar,banner_url,is_public,join_policy,member_count FROM communities.communities WHERE id=$1",
      [id],
    ).then(result => result.rows[0]);
  }

  @Get("communities/:slug")
  @Public()
  async community(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT c.id,c.slug,c.name,c.blurb,c.description,c.category,c.school_name,c.avatar,
              c.banner_url,c.is_public,c.join_policy,c.member_count,c.online_count,c.created_at,
              m.role
       FROM communities.communities c
       LEFT JOIN communities.memberships m ON m.community_id=c.id AND m.user_id=$2
       WHERE (c.slug=$1 OR c.id=$1) AND c.deleted_at IS NULL
         AND (c.is_public OR m.role IS NOT NULL)`,
      [slug, request.user?.id ?? ""],
    );
    if (!result.rows[0]) throw new ApiException(404, "not_found", "Community not found");
    return result.rows[0];
  }

  @Patch("communities/:slug")
  async updateCommunity(
    @Param("slug") slug: string,
    @Req() request: PlatformRequest,
    @Body() body: unknown,
  ) {
    const input = updateCommunitySchema.safeParse(body);
    if (!input.success) {
      const issue = input.error.issues[0];
      throw new ApiException(400, "validation_failed", issue?.message ?? "Invalid community", issue?.path.join(".") || null);
    }
    const name = input.data.name;
    const nextSlug = name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    if (name && !nextSlug) throw new ApiException(400, "validation_failed", "Community slug is invalid", "name");
    try {
      const result = await this.database.pool.query<Record<string, unknown>>(
        `UPDATE communities.communities community SET
           name=COALESCE($1,community.name),
           slug=COALESCE($2,community.slug),
           blurb=COALESCE($3,community.blurb),
           description=COALESCE($4,community.description),
           category=COALESCE($5,community.category),
           school_name=COALESCE($6,community.school_name),
           avatar=COALESCE($7,community.avatar),
           banner_url=COALESCE($8,community.banner_url),
           is_public=COALESCE($9,community.is_public),
           join_policy=COALESCE($10,community.join_policy)
         WHERE (community.slug=$11 OR community.id=$11) AND community.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM communities.memberships membership
             WHERE membership.community_id=community.id AND membership.user_id=$12 AND membership.role='owner'
           )
         RETURNING community.id,community.slug,community.name,community.blurb,community.description,
                   community.category,community.school_name,community.avatar,community.banner_url,
                   community.is_public,community.join_policy,community.member_count,community.online_count`,
        [
          name, nextSlug, input.data.blurb, input.data.description, input.data.category,
          input.data.schoolName, input.data.avatar, input.data.bannerUrl, input.data.isPublic,
          input.data.joinPolicy, slug, request.user?.id,
        ],
      );
      if (!result.rows[0]) throw new ApiException(404, "not_found", "Community not found or you cannot edit it");
      return result.rows[0];
    } catch (error) {
      if (error instanceof ApiException) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        throw new ApiException(409, "already_exists", "A community with that name already exists");
      }
      throw error;
    }
  }

  @Get("explore/communities")
  @Public()
  async exploreCommunities(@Req() request: PlatformRequest, @Query() query: Record<string, string | undefined>) {
    const input = exploreQuerySchema.parse(query);
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT community.id,community.slug,community.name,community.blurb,
              community.member_count,community.category,community.school_name,
              community.avatar,community.banner_url,community.is_public,
              membership.role
       FROM communities.communities community
       LEFT JOIN communities.memberships membership
         ON membership.community_id=community.id AND membership.user_id=$6
       WHERE community.is_public AND community.deleted_at IS NULL
         AND ($1::text IS NULL OR community.name ILIKE '%'||$1||'%' OR community.blurb ILIKE '%'||$1||'%')
         AND (
           $2::text IS NULL OR $2='All'
           OR ($2='My school' AND community.school_name=(
             SELECT profile.school_name FROM users.profiles profile WHERE profile.id=$6
           ))
           OR lower(community.category)=lower($2)
         )
         AND ($3::text IS NULL OR community.school_name=$3)
         AND (
           $5::text IS NULL
           OR ($4='new' AND (community.created_at,community.id) < (
             SELECT previous.created_at,previous.id FROM communities.communities previous WHERE previous.id=$5
           ))
           OR ($4='top' AND (community.member_count,community.id) < (
             SELECT previous.member_count,previous.id FROM communities.communities previous WHERE previous.id=$5
           ))
         )
       ORDER BY CASE WHEN $4='new' THEN community.created_at END DESC,
                CASE WHEN $4='top' THEN community.member_count END DESC,
                community.id
       LIMIT $7`,
      [
        input.q || null,
        input.category && input.category !== "All" ? input.category : null,
        input.school || null,
        input.sort,
        input.cursor ?? null,
        request.user?.id ?? null,
        input.limit + 1,
      ],
    );
    const rows = result.rows.slice(0, input.limit);
    return {
      items: rows.map(row => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        blurb: row.blurb,
        memberCount: Number(row.member_count),
        category: row.category ?? "Community",
        schoolName: row.school_name ?? undefined,
        avatar: row.avatar ?? undefined,
        bannerUrl: row.banner_url ?? undefined,
        isPublic: row.is_public,
        relation: row.role ? "member" : "none",
      })),
      nextCursor: result.rows.length > input.limit ? String(rows.at(-1)?.id) : null,
    };
  }

  @Post("communities/:slug/join")
  async join(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const community = await this.database.pool.query<{ id: string; join_policy: string; is_public: boolean }>(
      "SELECT id,join_policy,is_public FROM communities.communities WHERE (slug=$1 OR id=$1) AND deleted_at IS NULL",
      [slug],
    );
    const row = community.rows[0];
    if (!row) throw new ApiException(404, "not_found", "Community not found");
    const restriction = await this.database.pool.query(
      `SELECT 1 FROM communities.member_restrictions
       WHERE community_id=$1 AND user_id=$2
         AND (restriction='banned' OR (restriction='timeout' AND expires_at>now()))
       LIMIT 1`,
      [row.id, request.user?.id],
    );
    if (restriction.rowCount) throw new ApiException(403, "community_restricted", "You cannot join this community");
    if (row.join_policy === "invite-only" || (!row.is_public && row.join_policy === "open")) {
      throw new ApiException(403, "invite_required", "An invite is required");
    }
    if (row.join_policy === "request") {
      await this.database.pool.query(
        `INSERT INTO communities.join_requests (id,community_id,user_id,status)
         VALUES ($1,$2,$3,'pending') ON CONFLICT (community_id,user_id,status) DO NOTHING`,
        [randomUUID(), row.id, request.user?.id],
      );
      return { ok: true };
    }
    await this.database.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO communities.memberships (community_id,user_id,role)
         VALUES ($1,$2,'member') ON CONFLICT DO NOTHING RETURNING 1`,
        [row.id, request.user?.id],
      );
      if (inserted.rowCount) await client.query(
        "UPDATE communities.communities SET member_count=member_count+1 WHERE id=$1",
        [row.id],
      );
    });
    return { ok: true };
  }

  @Delete("communities/:slug/membership")
  async leave(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    await this.database.transaction(async (client) => {
      const community = await client.query<{ id: string }>(
        "SELECT id FROM communities.communities WHERE (slug=$1 OR id=$1)",
        [slug],
      );
      const row = community.rows[0];
      if (!row) throw new ApiException(404, "not_found", "Community not found");
      const membership = await client.query<{ role: string }>(
        "SELECT role FROM communities.memberships WHERE community_id=$1 AND user_id=$2",
        [row.id, request.user?.id],
      );
      if (membership.rows[0]?.role === "owner") throw new ApiException(409, "conflict", "The owner must transfer ownership first");
      const deleted = await client.query(
        "DELETE FROM communities.memberships WHERE community_id=$1 AND user_id=$2 RETURNING 1",
        [row.id, request.user?.id],
      );
      if (deleted.rowCount) await client.query(
        "UPDATE communities.communities SET member_count=GREATEST(member_count-1,0) WHERE id=$1",
        [row.id],
      );
    });
    return { ok: true };
  }

  @Delete("communities/:slug/join-request")
  async cancelJoinRequest(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const result = await this.database.pool.query(
      `DELETE FROM communities.join_requests request
       USING communities.communities community
       WHERE request.community_id=community.id AND (community.slug=$1 OR community.id=$1)
         AND request.user_id=$2 AND request.status='pending'
       RETURNING request.id`,
      [slug, request.user?.id],
    );
    if (!result.rowCount) throw new ApiException(404, "not_found", "Pending join request not found");
    return { ok: true };
  }

  @Get("communities/:slug/join-requests")
  async listJoinRequests(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const community = await this.database.pool.query<{ id: string; role: string }>(
      `SELECT community.id,membership.role
       FROM communities.communities community
       JOIN communities.memberships membership ON membership.community_id=community.id
       WHERE (community.slug=$1 OR community.id=$1) AND community.deleted_at IS NULL
         AND membership.user_id=$2`,
      [slug, request.user?.id],
    );
    if (!community.rows[0]) throw new ApiException(404, "not_found", "Community not found");
    if (!["owner", "moderator"].includes(community.rows[0].role)) {
      throw new ApiException(403, "community_forbidden", "Moderator access is required");
    }
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT request.id,request.user_id,profile.username,profile.avatar_url,profile.school_name,request.created_at
       FROM communities.join_requests request
       JOIN users.profiles profile ON profile.id=request.user_id
       WHERE request.community_id=$1 AND request.status='pending' AND profile.deleted_at IS NULL
       ORDER BY request.created_at,request.id
       LIMIT 100`,
      [community.rows[0].id],
    );
    return { items: result.rows };
  }

  @Post("communities/:slug/join-requests/:id/decision")
  async decideJoinRequest(
    @Param("slug") slug: string,
    @Param("id") requestId: string,
    @Req() request: PlatformRequest,
    @Body() body: unknown,
  ) {
    const { approve } = joinRequestDecisionSchema.parse(body);
    await this.database.transaction(async client => {
      const community = await client.query<{ id: string; role: string }>(
        `SELECT community.id,membership.role
         FROM communities.communities community
         JOIN communities.memberships membership ON membership.community_id=community.id
         WHERE (community.slug=$1 OR community.id=$1) AND community.deleted_at IS NULL
           AND membership.user_id=$2
         FOR UPDATE OF community,membership`,
        [slug, request.user?.id],
      );
      const row = community.rows[0];
      if (!row) throw new ApiException(404, "not_found", "Community not found");
      if (!["owner", "moderator"].includes(row.role)) {
        throw new ApiException(403, "community_forbidden", "Moderator access is required");
      }
      const joinRequest = await client.query<{ user_id: string }>(
        `SELECT user_id FROM communities.join_requests
         WHERE id=$1 AND community_id=$2 AND status='pending'
         FOR UPDATE`,
        [requestId, row.id],
      );
      const pending = joinRequest.rows[0];
      if (!pending) throw new ApiException(404, "not_found", "Pending join request not found");
      if (approve) {
        const restriction = await client.query(
          `SELECT 1 FROM communities.member_restrictions
           WHERE community_id=$1 AND user_id=$2
             AND (restriction='banned' OR (restriction='timeout' AND expires_at>now()))
           LIMIT 1`,
          [row.id, pending.user_id],
        );
        if (restriction.rowCount) throw new ApiException(403, "community_restricted", "This user cannot join the community");
        const inserted = await client.query(
          `INSERT INTO communities.memberships (community_id,user_id,role)
           VALUES ($1,$2,'member') ON CONFLICT DO NOTHING RETURNING 1`,
          [row.id, pending.user_id],
        );
        if (inserted.rowCount) {
          await client.query("UPDATE communities.communities SET member_count=member_count+1 WHERE id=$1", [row.id]);
        }
      }
      await client.query(
        "UPDATE communities.join_requests SET status=$1 WHERE id=$2",
        [approve ? "approved" : "rejected", requestId],
      );
      await client.query(
        `INSERT INTO moderation.community_audit_log
           (id,community_id,actor_id,action,target_kind,target_id,target_user_id)
         VALUES ($1,$2,$3,$4,'user',$5,$5)`,
        [randomUUID(), row.id, request.user?.id, approve ? "join_request.approved" : "join_request.rejected", pending.user_id],
      );
    });
    return { ok: true };
  }

  @Get("communities/:slug/invites")
  async listInvites(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const community = await this.database.pool.query<{ id: string; role: string }>(
      `SELECT community.id,membership.role
       FROM communities.communities community
       JOIN communities.memberships membership ON membership.community_id=community.id
       WHERE (community.slug=$1 OR community.id=$1) AND community.deleted_at IS NULL
         AND membership.user_id=$2`,
      [slug, request.user?.id],
    );
    if (!community.rows[0]) throw new ApiException(404, "not_found", "Community not found");
    if (!["owner", "moderator"].includes(community.rows[0].role)) {
      throw new ApiException(403, "community_forbidden", "Moderator access is required");
    }
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT id,max_uses,uses,expires_at,created_at
       FROM communities.invites
       WHERE community_id=$1 AND revoked_at IS NULL AND expires_at>now()
         AND (max_uses IS NULL OR uses<max_uses)
       ORDER BY created_at DESC
       LIMIT 100`,
      [community.rows[0].id],
    );
    return { items: result.rows };
  }

  @Post("communities/:slug/invites")
  async createInvite(@Param("slug") slug: string, @Req() request: PlatformRequest, @Body() body: unknown) {
    const input = createInviteSchema.parse(body);
    const community = await this.database.pool.query<{ id: string; role: string }>(
      `SELECT community.id,membership.role
       FROM communities.communities community
       JOIN communities.memberships membership ON membership.community_id=community.id
       WHERE (community.slug=$1 OR community.id=$1) AND community.deleted_at IS NULL
         AND membership.user_id=$2`,
      [slug, request.user?.id],
    );
    if (!community.rows[0]) throw new ApiException(404, "not_found", "Community not found");
    if (!["owner", "moderator"].includes(community.rows[0].role)) {
      throw new ApiException(403, "community_forbidden", "Moderator access is required");
    }
    const code = randomBytes(32).toString("base64url");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + input.expiresIn * 1000).toISOString();
    await this.database.transaction(async client => {
      await client.query(
        `INSERT INTO communities.invites (id,community_id,code_hash,created_by,max_uses,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, community.rows[0].id, inviteCodeHash(code), request.user?.id, input.maxUses ?? null, expiresAt],
      );
      await client.query(
        `INSERT INTO moderation.community_audit_log
           (id,community_id,actor_id,action,target_kind,target_id,metadata)
         VALUES ($1,$2,$3,'invite.created','invite',$4,$5::jsonb)`,
        [randomUUID(), community.rows[0].id, request.user?.id, id, JSON.stringify({ maxUses: input.maxUses ?? null, expiresAt })],
      );
    });
    return { id, code, expiresAt, maxUses: input.maxUses ?? null };
  }

  @Delete("communities/:slug/invites/:code")
  async revokeInvite(@Param("slug") slug: string, @Param("code") code: string, @Req() request: PlatformRequest) {
    const actor = await this.database.pool.query<{ id: string; role: string }>(
      `SELECT community.id,membership.role
       FROM communities.communities community
       JOIN communities.memberships membership ON membership.community_id=community.id
       WHERE (community.slug=$1 OR community.id=$1) AND community.deleted_at IS NULL
         AND membership.user_id=$2`,
      [slug, request.user?.id],
    );
    if (!actor.rows[0]) throw new ApiException(404, "not_found", "Community not found");
    if (!["owner", "moderator"].includes(actor.rows[0].role)) {
      throw new ApiException(403, "community_forbidden", "Moderator access is required");
    }
    await this.database.transaction(async client => {
      const revoked = await client.query<{ id: string }>(
        `UPDATE communities.invites SET revoked_at=now()
         WHERE community_id=$1 AND revoked_at IS NULL AND (id=$2 OR code_hash=$3)
         RETURNING id`,
        [actor.rows[0].id, code, inviteCodeHash(code)],
      );
      if (!revoked.rows[0]) throw new ApiException(404, "not_found", "Active invite not found");
      await client.query(
        `INSERT INTO moderation.community_audit_log
           (id,community_id,actor_id,action,target_kind,target_id)
         VALUES ($1,$2,$3,'invite.revoked','invite',$4)`,
        [randomUUID(), actor.rows[0].id, request.user?.id, revoked.rows[0].id],
      );
    });
    return { ok: true };
  }

  @Get("invites/:code")
  @Public()
  async previewInvite(@Param("code") code: string) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT invite.id,community.id AS community_id,community.slug,community.name,
              community.avatar,community.member_count,invite.expires_at
       FROM communities.invites invite
       JOIN communities.communities community ON community.id=invite.community_id
       WHERE invite.code_hash=$1 AND invite.revoked_at IS NULL AND invite.expires_at>now()
         AND (invite.max_uses IS NULL OR invite.uses<invite.max_uses)
         AND community.deleted_at IS NULL`,
      [inviteCodeHash(code)],
    );
    const invite = result.rows[0];
    if (!invite) throw new ApiException(404, "not_found", "Invite not found or expired");
    return {
      id: invite.id,
      community: {
        id: invite.community_id,
        slug: invite.slug,
        name: invite.name,
        avatar: invite.avatar,
        memberCount: invite.member_count,
      },
      expiresAt: invite.expires_at,
    };
  }

  @Post("invites/:code/accept")
  async acceptInvite(@Param("code") code: string, @Req() request: PlatformRequest) {
    const userId = request.user?.id;
    if (!userId) throw new ApiException(401, "unauthenticated", "Sign in to continue");
    await this.database.transaction(async client => {
      const result = await client.query<{ id: string; community_id: string }>(
        `SELECT invite.id,invite.community_id
         FROM communities.invites invite
         JOIN communities.communities community ON community.id=invite.community_id
         WHERE invite.code_hash=$1 AND invite.revoked_at IS NULL AND invite.expires_at>now()
           AND (invite.max_uses IS NULL OR invite.uses<invite.max_uses)
           AND community.deleted_at IS NULL
         FOR UPDATE OF invite`,
        [inviteCodeHash(code)],
      );
      const invite = result.rows[0];
      if (!invite) throw new ApiException(404, "not_found", "Invite not found or expired");
      const restriction = await client.query(
        `SELECT 1 FROM communities.member_restrictions
         WHERE community_id=$1 AND user_id=$2
           AND (restriction='banned' OR (restriction='timeout' AND expires_at>now()))
         LIMIT 1`,
        [invite.community_id, userId],
      );
      if (restriction.rowCount) throw new ApiException(403, "community_restricted", "You cannot join this community");
      const inserted = await client.query(
        `INSERT INTO communities.memberships (community_id,user_id,role)
         VALUES ($1,$2,'member') ON CONFLICT DO NOTHING RETURNING 1`,
        [invite.community_id, userId],
      );
      if (inserted.rowCount) {
        await client.query("UPDATE communities.communities SET member_count=member_count+1 WHERE id=$1", [invite.community_id]);
        await client.query("UPDATE communities.invites SET uses=uses+1 WHERE id=$1", [invite.id]);
        await client.query(
          "DELETE FROM communities.join_requests WHERE community_id=$1 AND user_id=$2 AND status='pending'",
          [invite.community_id, userId],
        );
        await client.query(
          `INSERT INTO moderation.community_audit_log
             (id,community_id,actor_id,action,target_kind,target_id,target_user_id)
           VALUES ($1,$2,$3,'invite.accepted','user',$3,$3)`,
          [randomUUID(), invite.community_id, userId],
        );
      }
    });
    return { ok: true };
  }

  @Get("me/communities")
  async myCommunities(@Req() request: PlatformRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT c.id,c.slug,c.name,c.blurb,c.member_count,c.category,c.school_name,c.avatar,c.banner_url,c.is_public,m.role
       FROM communities.memberships m
       JOIN communities.communities c ON c.id=m.community_id
       WHERE m.user_id=$1 AND c.deleted_at IS NULL
       ORDER BY c.created_at`,
      [request.user?.id],
    );
    return result.rows;
  }

  @Get("communities/:slug/members")
  async communityMembers(
    @Param("slug") slug: string,
    @Req() request: PlatformRequest,
    @Query("q") query?: string,
    @Query("role") role?: string,
    @Query("cursor") cursor?: string,
  ) {
    const community = await this.database.pool.query<{ id: string }>(
      `SELECT c.id FROM communities.communities c
       JOIN communities.memberships mine ON mine.community_id=c.id AND mine.user_id=$2
       WHERE (c.slug=$1 OR c.id=$1) AND c.deleted_at IS NULL`,
      [slug, request.user?.id],
    );
    if (!community.rows[0]) throw new ApiException(404, "not_found", "Community not found");
    const requestedRole = role ? communityRoleSchema.safeParse(role) : undefined;
    if (requestedRole && !requestedRole.success) throw new ApiException(400, "validation_failed", "Invalid member role", "role");
    const members = await this.database.pool.query<{
      id: string; username: string; avatar_url: string | null; school_name: string | null; role: "owner" | "moderator" | "member";
    }>(
      `SELECT profile.id,profile.username,profile.avatar_url,profile.school_name,membership.role
       FROM communities.memberships membership
       JOIN users.profiles profile ON profile.id=membership.user_id
       WHERE membership.community_id=$1 AND profile.deleted_at IS NULL
         AND ($2::text IS NULL OR profile.username ILIKE '%'||$2||'%')
         AND ($3::text IS NULL OR membership.role=$3)
         AND ($4::text IS NULL OR profile.username>$4)
       ORDER BY profile.username
       LIMIT 101`,
      [community.rows[0].id, query?.trim() || null, requestedRole?.success ? requestedRole.data : null, cursor || null],
    );
    const people = members.rows.slice(0, 100).map(member => ({
      id: member.id,
      username: member.username,
      avatarUrl: member.avatar_url ?? undefined,
      schoolName: member.school_name ?? undefined,
      role: member.role,
    }));
    return {
      owners: people.filter(member => member.role === "owner"),
      moderators: people.filter(member => member.role === "moderator"),
      online: [],
      offline: people.filter(member => member.role === "member"),
      page: { next: members.rows.length > 100 ? members.rows[99].username : null, prev: null },
    };
  }

  @Patch("communities/:slug/members/:userId")
  async updateCommunityMember(
    @Param("slug") slug: string,
    @Param("userId") userId: string,
    @Req() request: PlatformRequest,
    @Body() body: unknown,
  ) {
    const { role } = memberRoleRequestSchema.parse(body);
    const result = await this.database.pool.query(
      `UPDATE communities.memberships target SET role=$1
       FROM communities.communities community
       WHERE target.community_id=community.id AND (community.slug=$2 OR community.id=$2)
         AND community.deleted_at IS NULL AND target.user_id=$3
       AND target.role<>'owner'
         AND EXISTS (
           SELECT 1 FROM communities.memberships actor
           WHERE actor.community_id=community.id AND actor.user_id=$4 AND actor.role='owner'
         )
       RETURNING target.user_id`,
      [role, slug, userId, request.user?.id],
    );
    if (!result.rowCount) throw new ApiException(404, "not_found", "Member not found or you cannot manage this community");
    return { ok: true };
  }

  @Delete("communities/:slug/members/:userId")
  async removeCommunityMember(
    @Param("slug") slug: string,
    @Param("userId") userId: string,
    @Req() request: PlatformRequest,
  ) {
    if (userId === request.user?.id) throw new ApiException(409, "conflict", "Use the leave action to remove yourself");
    await this.database.transaction(async client => {
      const membership = await client.query<{ target_role: string; actor_role: string }>(
        `SELECT target.role AS target_role,actor.role AS actor_role
         FROM communities.communities community
         JOIN communities.memberships target ON target.community_id=community.id AND target.user_id=$2
         JOIN communities.memberships actor ON actor.community_id=community.id AND actor.user_id=$3
         WHERE (community.slug=$1 OR community.id=$1) AND community.deleted_at IS NULL
         FOR UPDATE OF target,actor`,
        [slug, userId, request.user?.id],
      );
      const row = membership.rows[0];
      if (!row) throw new ApiException(404, "not_found", "Member not found");
      if (
        (row.actor_role !== "owner" && row.actor_role !== "moderator") ||
        row.target_role === "owner" ||
        (row.actor_role === "moderator" && row.target_role !== "member")
      ) {
        throw new ApiException(403, "community_forbidden", "You cannot remove this member");
      }
      const removed = await client.query(
        "DELETE FROM communities.memberships WHERE community_id=(SELECT id FROM communities.communities WHERE slug=$1 OR id=$1) AND user_id=$2 RETURNING 1",
        [slug, userId],
      );
      if (removed.rowCount) {
        await client.query(
          "UPDATE communities.communities SET member_count=GREATEST(member_count-1,0) WHERE slug=$1 OR id=$1",
          [slug],
        );
      }
    });
    return { ok: true };
  }

  @Get("communities/:slug/assets")
  async assets(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT asset.*, membership.role
       FROM assets.assets asset
       JOIN communities.communities community ON community.id=asset.community_id
       LEFT JOIN communities.memberships membership
         ON membership.community_id=community.id AND membership.user_id=$2
       WHERE (community.slug=$1 OR community.id=$1) AND asset.deleted_at IS NULL
         AND (community.is_public OR membership.role IS NOT NULL)
         AND (asset.is_public OR membership.role IS NOT NULL)
       ORDER BY asset.sort_order,asset.name`,
      [slug, request.user?.id ?? ""],
    );
    const visible = result.rows.filter(row =>
      row.hidden_from_members !== true ||
      row.role === "owner" ||
      row.role === "moderator",
    );
    const groups = ASSET_CATEGORY_ORDER.map(category => ({
      category,
      assets: visible.filter(row => row.category === category),
    })).filter(group => group.assets.length > 0);
    return groups;
  }

  @Put("communities/:slug/assets/order")
  async reorderAssets(@Param("slug") slug: string, @Req() request: PlatformRequest, @Body() body: unknown) {
    const { assetIds } = assetOrderSchema.parse(body);
    await this.database.transaction(async client => {
      const community = await client.query<{ id: string }>(
        `SELECT community.id FROM communities.communities community
         JOIN communities.memberships membership ON membership.community_id=community.id
         WHERE (community.slug=$1 OR community.id=$1) AND community.deleted_at IS NULL
           AND membership.user_id=$2 AND membership.role IN ('owner','moderator')
         FOR UPDATE OF community`,
        [slug, request.user?.id],
      );
      const communityId = community.rows[0]?.id;
      if (!communityId) throw new ApiException(403, "community_forbidden", "Only owners and moderators can reorder assets");
      const current = await client.query<{ id: string; is_default: boolean; sort_order: number }>(
        "SELECT id,is_default,sort_order FROM assets.assets WHERE community_id=$1 AND deleted_at IS NULL ORDER BY sort_order,id",
        [communityId],
      );
      const currentIds = new Set(current.rows.map(asset => asset.id));
      const requestedIds = new Set(assetIds);
      if (
        requestedIds.size !== assetIds.length ||
        currentIds.size !== assetIds.length ||
        assetIds.some(id => !currentIds.has(id))
      ) {
        throw new ApiException(400, "validation_failed", "Asset order must include each community asset exactly once", "assetIds");
      }
      const defaultIds = current.rows.filter(asset => asset.is_default).map(asset => asset.id);
      if (assetIds.filter(id => defaultIds.includes(id)).join("\0") !== defaultIds.join("\0")) {
        throw new ApiException(400, "validation_failed", "Default assets cannot be reordered", "assetIds");
      }
      for (const [order, assetId] of assetIds.entries()) {
        await client.query("UPDATE assets.assets SET sort_order=$1 WHERE id=$2 AND community_id=$3", [order, assetId, communityId]);
      }
    });
    return this.assets(slug, request);
  }

  @Patch("assets/:id/permissions")
  async updateAssetPermissions(@Param("id") id: string, @Req() request: PlatformRequest, @Body() body: unknown) {
    const input = z.object({ permissions: assetPermissionsSchema }).strict().safeParse(body);
    if (!input.success) {
      const issue = input.error.issues[0];
      throw new ApiException(400, "validation_failed", issue?.message ?? "Invalid permissions", issue?.path.join(".") || null);
    }
    const result = await this.database.pool.query<Record<string, unknown>>(
      `UPDATE assets.assets asset
       SET can_read_roles=$1,can_post_roles=$2,can_pin_roles=$3
       WHERE asset.id=$4 AND asset.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM communities.memberships membership
           WHERE membership.community_id=asset.community_id
             AND membership.user_id=$5 AND membership.role='owner'
         )
       RETURNING asset.*`,
      [input.data.permissions.canRead, input.data.permissions.canPost, input.data.permissions.canPin, id, request.user?.id],
    );
    if (!result.rows[0]) throw new ApiException(404, "not_found", "Asset not found or you cannot manage its permissions");
    const row = result.rows[0];
    return {
      id: row.id,
      communityId: row.community_id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? undefined,
      kind: row.kind,
      category: row.category,
      permissions: {
        canRead: row.can_read_roles,
        canPost: row.can_post_roles,
        canPin: row.can_pin_roles,
      },
      isDefault: row.is_default,
      catalogKey: row.catalog_key,
      order: row.sort_order,
      hiddenFromMembers: row.hidden_from_members,
    };
  }

  @Post("communities/:slug/assets")
  async addAsset(@Param("slug") slug: string, @Req() request: PlatformRequest, @Body() body: unknown) {
    const catalogKey = (body as Record<string, unknown>).catalogKey;
    const entry = [...DEFAULT_ASSETS, ...ASSET_CATALOG].find(item => item.key === catalogKey);
    if (!entry) throw new ApiException(400, "asset_not_in_catalog", "Asset is not in the fixed catalog");
    if (entry.isDefault) throw new ApiException(409, "asset_protected", "Default assets already exist");
    const community = await this.database.pool.query<{ id: string; role: string }>(
      `SELECT c.id,m.role FROM communities.communities c
       JOIN communities.memberships m ON m.community_id=c.id
       WHERE (c.slug=$1 OR c.id=$1) AND m.user_id=$2`,
      [slug, request.user?.id],
    );
    const row = community.rows[0];
    if (!row || !["owner", "moderator"].includes(row.role)) throw new ApiException(403, "community_forbidden", "Only owners and moderators can add assets");
    const id = randomUUID();
    await this.database.pool.query(
      `INSERT INTO assets.assets (
        id,community_id,catalog_key,name,slug,kind,category,description,is_default,
        hidden_from_members,can_read_roles,can_post_roles,can_pin_roles,is_public,sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$11,$12,true,100)`,
      [id, row.id, entry.key, entry.name, entry.key, entry.kind, entry.category, entry.description,
        entry.hiddenFromMembers ?? false, entry.permissions.canRead, entry.permissions.canPost, entry.permissions.canPin],
    );
    return { id, catalogKey: entry.key, name: entry.name, slug: entry.key, kind: entry.kind, category: entry.category };
  }

  @Get("communities/:slug/assets/:key")
  async resolveAsset(@Param("slug") slug: string, @Param("key") key: string, @Req() request: PlatformRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT asset.*,membership.role
       FROM assets.assets asset
       JOIN communities.communities community ON community.id=asset.community_id
       LEFT JOIN communities.memberships membership ON membership.community_id=community.id AND membership.user_id=$3
       WHERE (community.slug=$1 OR community.id=$1) AND asset.slug=$2 AND asset.deleted_at IS NULL
         AND (community.is_public OR membership.role IS NOT NULL)
         AND (asset.is_public OR membership.role IS NOT NULL)`,
      [slug, key, request.user?.id ?? ""],
    );
    if (!result.rows[0]) throw new ApiException(404, "not_found", "Asset not found");
    const row = result.rows[0];
    if (row.hidden_from_members && row.role !== "owner" && row.role !== "moderator") throw new ApiException(404, "not_found", "Asset not found");
    return row;
  }

  @Delete("assets/:id")
  async deleteAsset(@Param("id") id: string, @Req() request: PlatformRequest) {
    const asset = await this.database.pool.query<{ is_default: boolean; community_id: string; role: string }>(
      `SELECT asset.is_default,asset.community_id,membership.role
       FROM assets.assets asset
       JOIN communities.memberships membership ON membership.community_id=asset.community_id AND membership.user_id=$2
       WHERE asset.id=$1`,
      [id, request.user?.id],
    );
    const row = asset.rows[0];
    if (!row) throw new ApiException(404, "not_found", "Asset not found");
    if (row.is_default) throw new ApiException(409, "asset_protected", "Default assets cannot be deleted");
    if (!["owner", "moderator"].includes(row.role)) throw new ApiException(403, "community_forbidden", "Only owners and moderators can delete assets");
    await this.database.pool.query("UPDATE assets.assets SET deleted_at=now() WHERE id=$1", [id]);
    return { ok: true };
  }
}
