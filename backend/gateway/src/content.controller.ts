import { randomUUID } from "node:crypto";
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService } from "@square/kernel";
import { z } from "zod";

type ContentRequest = FastifyRequest & { user?: AuthenticatedUser };

const postSchema = z.object({
  body: z.string().trim().min(1).max(10_000).optional(),
  content: z.string().trim().min(1).max(10_000).optional(),
  title: z.string().trim().max(200).optional(),
  mediaIds: z.array(z.string().min(1).max(256)).max(10).optional(),
  pin: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  status: z.enum(["open", "planned", "done"]).optional(),
}).strict().refine(input => Boolean(input.body ?? input.content), {
  path: ["body"],
  message: "Post body is required",
});
const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  place: z.string().trim().max(200).optional(),
  onlineUrl: z.url().refine(value => ["http:", "https:"].includes(new URL(value).protocol)).optional(),
  description: z.string().max(10_000).optional(),
  coverUploadId: z.string().max(256).optional(),
}).strict().refine(input => !input.endsAt || Date.parse(input.endsAt) > Date.parse(input.startsAt), {
  path: ["endsAt"],
  message: "Event end must be after its start",
});
const rsvpSchema = z.object({ state: z.enum(["going", "interested", "not_going"]) }).strict();
const entrySchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.url().refine(value => ["http:", "https:"].includes(new URL(value).protocol)).optional(),
  description: z.string().max(10_000).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  deadlineAt: z.iso.datetime().optional(),
}).strict();
const boardItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  blurb: z.string().max(500).optional(),
  description: z.string().max(10_000).optional(),
  why: z.string().max(2_000).optional(),
  needs: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  stage: z.enum(["idea", "building", "launched", "looking-for-team", "team-formed", "submitted"]),
}).strict();
const campaignSchema = z.object({
  title: z.string().trim().min(1).max(200),
  goal: z.string().max(2_000).optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  tasks: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    proofRequired: z.boolean().optional(),
    points: z.number().int().min(0).max(10_000).optional(),
  }).strict()).max(100).optional(),
}).strict().refine(input => !input.startsAt || !input.endsAt || Date.parse(input.endsAt) > Date.parse(input.startsAt), {
  path: ["endsAt"],
  message: "Campaign end must be after its start",
});
const taskCompletionSchema = z.object({ proof: z.string().max(2_000).optional() }).strict().default({});

function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiException(400, "validation_failed", issue?.message ?? "Invalid request", issue?.path.join(".") || null);
  }
  return parsed.data;
}

@Controller()
export class ContentController {
  constructor(private readonly database: DatabaseService) {}

  private async assetAccess(
    assetId: string,
    userId: string,
    access: "read" | "post" | "member" | "moderator",
  ) {
    const result = await this.database.pool.query<{
      role: string | null;
      can_read: boolean;
      can_post: boolean;
      can_pin: boolean;
      can_member: boolean;
    }>(
      `SELECT membership.role,
              (
                (membership.role IS NOT NULL AND membership.role=ANY(asset.can_read_roles))
                OR (membership.role IS NULL AND community.is_public AND asset.is_public)
              ) AND (
                NOT asset.hidden_from_members OR membership.role IN ('owner','moderator')
              ) AS can_read,
              (membership.role IS NOT NULL AND membership.role=ANY(asset.can_post_roles))
                AND (NOT asset.hidden_from_members OR membership.role IN ('owner','moderator'))
                AND NOT EXISTS (
                  SELECT 1 FROM communities.member_restrictions restriction
                  WHERE restriction.community_id=community.id AND restriction.user_id=membership.user_id
                    AND (restriction.restriction='banned'
                      OR (restriction.restriction='timeout' AND restriction.expires_at>now()))
                ) AS can_post,
              (membership.role IS NOT NULL AND membership.role=ANY(asset.can_pin_roles)) AS can_pin,
              (membership.role IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM communities.member_restrictions restriction
                WHERE restriction.community_id=community.id AND restriction.user_id=membership.user_id
                  AND (restriction.restriction='banned'
                    OR (restriction.restriction='timeout' AND restriction.expires_at>now()))
              )) AS can_member
       FROM assets.assets asset
       JOIN communities.communities community ON community.id=asset.community_id
       LEFT JOIN communities.memberships membership
         ON membership.community_id=community.id AND membership.user_id=$2
       WHERE asset.id=$1 AND asset.deleted_at IS NULL AND community.deleted_at IS NULL`,
      [assetId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new ApiException(404, "not_found", "Asset not found");
    const allowed = access === "read"
      ? row.can_read
      : access === "post"
        ? row.can_post
        : access === "member"
          ? row.can_member
          : row.role === "owner" || row.role === "moderator";
    if (!allowed) {
      if (access === "read") throw new ApiException(404, "not_found", "Asset not found");
      throw new ApiException(403, "asset_forbidden", "You cannot access this asset");
    }
    return row;
  }

  @Get("assets/:id/posts")
  async listPosts(
    @Param("id") assetId: string,
    @Req() request: ContentRequest,
    @Query("cursor") cursor?: string,
    @Query("after") after?: string,
  ) {
    const pageCursor = cursor ?? after;
    await this.assetAccess(assetId, request.user!.id, "read");
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT p.*,u.username AS author_username
       FROM feeds.posts p JOIN users.profiles u ON u.id=p.author_id
       WHERE p.asset_id=$1 AND p.deleted_at IS NULL
         AND ($2::text IS NULL OR (p.pinned,p.created_at,p.id) < (
           SELECT previous.pinned,previous.created_at,previous.id
           FROM feeds.posts previous WHERE previous.id=$2 AND previous.asset_id=$1
         ))
       ORDER BY p.pinned DESC,p.created_at DESC,p.id DESC LIMIT 31`,
      [assetId, pageCursor || null],
    );
    return { items: result.rows.slice(0, 30), page: { next: result.rows.length > 30 ? result.rows[29].id : null, prev: null } };
  }

  @Post("assets/:id/posts")
  async createPost(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = parseBody(postSchema, body);
    const access = await this.assetAccess(assetId, request.user!.id, "post");
    if (input.pin && !access.can_pin) {
      throw new ApiException(403, "asset_forbidden", "Only moderators can pin posts");
    }
    const text = input.body ?? input.content!;
    const id = randomUUID();
    await this.database.pool.query(
      "INSERT INTO feeds.posts (id,asset_id,author_id,title,body,media_ids,pinned,comments_enabled,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, assetId, request.user!.id, input.title ?? null, text,
        input.mediaIds ?? [], input.pin ?? false, input.commentsEnabled ?? true, input.status ?? null],
    );
    return { id, assetId, authorId: request.user!.id, body: text, title: input.title ?? null };
  }

  @Get("assets/:id/events")
  async listEvents(@Param("id") assetId: string, @Req() request: ContentRequest) {
    await this.assetAccess(assetId, request.user!.id, "read");
    const result = await this.database.pool.query(
      "SELECT * FROM events.events WHERE asset_id=$1 AND cancelled_at IS NULL ORDER BY starts_at",
      [assetId],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("assets/:id/events")
  async createEvent(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = parseBody(eventSchema, body);
    await this.assetAccess(assetId, request.user!.id, "post");
    const id = randomUUID();
    await this.database.pool.query(
      `INSERT INTO events.events (id,asset_id,creator_id,title,starts_at,ends_at,timezone,place,online_url,description,cover_upload_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, assetId, request.user!.id, input.title, input.startsAt,
        input.endsAt ?? null, input.timezone ?? "Africa/Lagos", input.place ?? null,
        input.onlineUrl ?? null, input.description ?? null, input.coverUploadId ?? null],
    );
    return { id, title: input.title, startsAt: input.startsAt };
  }

  @Put("events/:id/rsvp")
  async rsvp(@Param("id") eventId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const { state } = parseBody(rsvpSchema, body);
    const event = await this.database.pool.query<{ asset_id: string }>(
      "SELECT asset_id FROM events.events WHERE id=$1 AND cancelled_at IS NULL",
      [eventId],
    );
    if (!event.rows[0]) throw new ApiException(404, "not_found", "Event not found");
    await this.assetAccess(event.rows[0].asset_id, request.user!.id, "member");
    await this.database.pool.query(
      `INSERT INTO events.rsvps (event_id,user_id,state) VALUES ($1,$2,$3)
       ON CONFLICT (event_id,user_id) DO UPDATE SET state=$3,updated_at=now()`,
      [eventId, request.user?.id, state],
    );
    return { ok: true };
  }

  @Get("assets/:id/entries")
  async listEntries(@Param("id") assetId: string, @Req() request: ContentRequest) {
    await this.assetAccess(assetId, request.user!.id, "read");
    const result = await this.database.pool.query(
      "SELECT * FROM lists.entries WHERE asset_id=$1 AND deleted_at IS NULL ORDER BY pinned DESC,created_at DESC LIMIT 100",
      [assetId],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("assets/:id/entries")
  async createEntry(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = parseBody(entrySchema, body);
    await this.assetAccess(assetId, request.user!.id, "post");
    const id = randomUUID();
    await this.database.pool.query(
      "INSERT INTO lists.entries (id,asset_id,author_id,title,url,description,tags,deadline_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, assetId, request.user!.id, input.title, input.url ?? null,
        input.description ?? null, input.tags ?? [], input.deadlineAt ?? null],
    );
    return { id, assetId, title: input.title };
  }

  @Put("entries/:id/save")
  async saveEntry(@Param("id") entryId: string, @Req() request: ContentRequest) {
    const entry = await this.database.pool.query<{ asset_id: string }>(
      "SELECT asset_id FROM lists.entries WHERE id=$1 AND deleted_at IS NULL",
      [entryId],
    );
    if (!entry.rows[0]) throw new ApiException(404, "not_found", "Entry not found");
    await this.assetAccess(entry.rows[0].asset_id, request.user!.id, "member");
    await this.database.pool.query(
      "INSERT INTO lists.saves (entry_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [entryId, request.user!.id],
    );
    return { ok: true };
  }

  @Get("assets/:id/items")
  async listBoardItems(@Param("id") assetId: string, @Req() request: ContentRequest) {
    await this.assetAccess(assetId, request.user!.id, "read");
    const result = await this.database.pool.query(
      "SELECT * FROM boards.items WHERE asset_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100",
      [assetId],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("assets/:id/items")
  async createBoardItem(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = parseBody(boardItemSchema, body);
    await this.assetAccess(assetId, request.user!.id, "post");
    const id = randomUUID();
    await this.database.pool.query(
      "INSERT INTO boards.items (id,asset_id,owner_id,title,blurb,description,why,needs,stage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, assetId, request.user!.id, input.title, input.blurb ?? null,
        input.description ?? null, input.why ?? null, input.needs ?? [], input.stage],
    );
    return { id, assetId, title: input.title, stage: input.stage };
  }

  @Delete("assets/:id/items/:itemId")
  async deleteBoardItem(
    @Param("id") assetId: string,
    @Param("itemId") itemId: string,
    @Req() request: ContentRequest,
  ) {
    const item = await this.database.pool.query<{ owner_id: string }>(
      "SELECT owner_id FROM boards.items WHERE id=$1 AND asset_id=$2 AND deleted_at IS NULL",
      [itemId, assetId],
    );
    if (!item.rows[0]) throw new ApiException(404, "not_found", "Board item not found");
    const access = await this.assetAccess(assetId, request.user!.id, "member");
    if (item.rows[0].owner_id !== request.user!.id && access.role !== "owner" && access.role !== "moderator") {
      throw new ApiException(403, "asset_forbidden", "You cannot delete this board item");
    }
    await this.database.pool.query(
      "UPDATE boards.items SET deleted_at=now() WHERE id=$1 AND asset_id=$2 AND deleted_at IS NULL",
      [itemId, assetId],
    );
    return { ok: true };
  }

  @Post("assets/:id/campaigns")
  async createCampaign(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = parseBody(campaignSchema, body);
    const access = await this.assetAccess(assetId, request.user!.id, "post");
    if (access.role !== "owner" && access.role !== "moderator") {
      throw new ApiException(403, "asset_forbidden", "Only moderators can create campaigns");
    }
    const id = randomUUID();
    await this.database.transaction(async client => {
      await client.query(
        "INSERT INTO campaigns.campaigns (id,asset_id,creator_id,title,goal,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, assetId, request.user!.id, input.title, input.goal ?? null, input.startsAt ?? null, input.endsAt ?? null],
      );
      for (const task of input.tasks ?? []) {
        await client.query(
          "INSERT INTO campaigns.tasks (id,campaign_id,title,proof_required,points) VALUES ($1,$2,$3,$4,$5)",
          [randomUUID(), id, task.title, task.proofRequired ?? false, task.points ?? 10],
        );
      }
    });
    return { id, assetId, title: input.title };
  }

  @Get("assets/:id/campaigns")
  async listCampaigns(@Param("id") assetId: string, @Req() request: ContentRequest) {
    await this.assetAccess(assetId, request.user!.id, "read");
    const result = await this.database.pool.query(
      "SELECT * FROM campaigns.campaigns WHERE asset_id=$1 AND ended_at IS NULL ORDER BY created_at DESC LIMIT 100",
      [assetId],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("campaigns/:id/join")
  async joinCampaign(@Param("id") campaignId: string, @Req() request: ContentRequest) {
    const campaign = await this.database.pool.query<{ asset_id: string }>(
      "SELECT asset_id FROM campaigns.campaigns WHERE id=$1 AND ended_at IS NULL",
      [campaignId],
    );
    if (!campaign.rows[0]) throw new ApiException(404, "not_found", "Campaign not found");
    await this.assetAccess(campaign.rows[0].asset_id, request.user!.id, "member");
    await this.database.pool.query(
      "INSERT INTO campaigns.participants (campaign_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [campaignId, request.user!.id],
    );
    return { ok: true };
  }

  @Post("tasks/:id/complete")
  async completeTask(@Param("id") taskId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = parseBody(taskCompletionSchema, body);
    const task = await this.database.pool.query<{ asset_id: string; campaign_id: string }>(
      `SELECT campaign.asset_id,campaign.id AS campaign_id
       FROM campaigns.tasks task
       JOIN campaigns.campaigns campaign ON campaign.id=task.campaign_id
       WHERE task.id=$1 AND task.deleted_at IS NULL AND campaign.ended_at IS NULL`,
      [taskId],
    );
    if (!task.rows[0]) throw new ApiException(404, "not_found", "Campaign task not found");
    await this.assetAccess(task.rows[0].asset_id, request.user!.id, "member");
    const participant = await this.database.pool.query(
      "SELECT 1 FROM campaigns.participants WHERE campaign_id=$1 AND user_id=$2",
      [task.rows[0].campaign_id, request.user!.id],
    );
    if (!participant.rowCount) throw new ApiException(403, "campaign_forbidden", "Join the campaign before completing tasks");
    await this.database.pool.query(
      `INSERT INTO campaigns.completions (id,task_id,user_id,proof,status)
       VALUES ($1,$2,$3,$4,'pending') ON CONFLICT (task_id,user_id) DO NOTHING`,
      [randomUUID(), taskId, request.user!.id, input.proof ?? null],
    );
    return { ok: true };
  }
}
