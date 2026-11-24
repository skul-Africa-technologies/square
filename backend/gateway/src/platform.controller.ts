import { randomUUID } from "node:crypto";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService, Public } from "@square/kernel";
import { ASSET_CATALOG, DEFAULT_ASSETS, ASSET_CATEGORY_ORDER } from "@square/shared";

type PlatformRequest = FastifyRequest & { user?: AuthenticatedUser };

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
    const input = body as Record<string, unknown>;
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
    if (!name) throw new ApiException(400, "validation_failed", "Community name is required", "name");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    if (!slug) throw new ApiException(400, "validation_failed", "Community slug is invalid", "name");
    const id = randomUUID();
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO communities.communities (id,slug,name,blurb,description,category,school_name,avatar,is_public,join_policy,member_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)
         ON CONFLICT (slug) DO NOTHING`,
        [id, slug, name, String(input.blurb || "").slice(0, 200), String(input.description || "").slice(0, 2000),
          String(input.category || "Community"), String(input.schoolName || ""), name.slice(0, 2).toUpperCase(),
          input.isPublic !== false, String(input.joinPolicy || "open")],
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
    return this.database.pool.query<Record<string, unknown>>(
      "SELECT id,slug,name,blurb,category,school_name,avatar,banner_url,is_public,join_policy,member_count FROM communities.communities WHERE id=$1",
      [id],
    ).then(result => result.rows[0]);
  }

  @Get("communities/:slug")
  @Public()
  async community(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT c.*, m.role
       FROM communities.communities c
       LEFT JOIN communities.memberships m ON m.community_id=c.id AND m.user_id=$2
       WHERE c.slug=$1 AND c.deleted_at IS NULL`,
      [slug, request.user?.id ?? ""],
    );
    if (!result.rows[0]) throw new ApiException(404, "not_found", "Community not found");
    return result.rows[0];
  }

  @Post("communities/:slug/join")
  async join(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const community = await this.database.pool.query<{ id: string; join_policy: string; is_public: boolean }>(
      "SELECT id,join_policy,is_public FROM communities.communities WHERE slug=$1 AND deleted_at IS NULL",
      [slug],
    );
    const row = community.rows[0];
    if (!row) throw new ApiException(404, "not_found", "Community not found");
    if (row.join_policy === "invite-only") throw new ApiException(403, "invite_required", "An invite is required");
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
        "SELECT id FROM communities.communities WHERE slug=$1",
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

  @Get("communities/:slug/assets")
  async assets(@Param("slug") slug: string, @Req() request: PlatformRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT asset.*, membership.role
       FROM assets.assets asset
       JOIN communities.communities community ON community.id=asset.community_id
       LEFT JOIN communities.memberships membership
         ON membership.community_id=community.id AND membership.user_id=$2
       WHERE community.slug=$1 AND asset.deleted_at IS NULL
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

  @Post("communities/:slug/assets")
  async addAsset(@Param("slug") slug: string, @Req() request: PlatformRequest, @Body() body: unknown) {
    const catalogKey = (body as Record<string, unknown>).catalogKey;
    const entry = [...DEFAULT_ASSETS, ...ASSET_CATALOG].find(item => item.key === catalogKey);
    if (!entry) throw new ApiException(400, "asset_not_in_catalog", "Asset is not in the fixed catalog");
    if (entry.isDefault) throw new ApiException(409, "asset_protected", "Default assets already exist");
    const community = await this.database.pool.query<{ id: string; role: string }>(
      `SELECT c.id,m.role FROM communities.communities c
       JOIN communities.memberships m ON m.community_id=c.id
       WHERE c.slug=$1 AND m.user_id=$2`,
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
       WHERE community.slug=$1 AND asset.slug=$2 AND asset.deleted_at IS NULL`,
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
