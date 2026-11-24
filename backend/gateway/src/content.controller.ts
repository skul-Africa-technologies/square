import { randomUUID } from "node:crypto";
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService } from "@square/kernel";

type ContentRequest = FastifyRequest & { user?: AuthenticatedUser };

@Controller()
export class ContentController {
  constructor(private readonly database: DatabaseService) {}

  @Get("assets/:id/posts")
  async listPosts(@Param("id") assetId: string, @Query("cursor") cursor?: string) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT p.*,u.username AS author_username
       FROM feeds.posts p JOIN users.profiles u ON u.id=p.author_id
       WHERE p.asset_id=$1 AND p.deleted_at IS NULL
         AND ($2::text IS NULL OR p.id<$2)
       ORDER BY p.pinned DESC,p.created_at DESC LIMIT 31`,
      [assetId, cursor || null],
    );
    return { items: result.rows.slice(0, 30), page: { next: result.rows.length > 30 ? result.rows[29].id : null, prev: null } };
  }

  @Post("assets/:id/posts")
  async createPost(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    const text = typeof input.body === "string" ? input.body : typeof input.content === "string" ? input.content : "";
    if (!text.trim() || text.length > 10000) throw new ApiException(400, "validation_failed", "Invalid post body", "body");
    const id = randomUUID();
    await this.database.pool.query(
      "INSERT INTO feeds.posts (id,asset_id,author_id,title,body,media_ids,pinned,comments_enabled,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, assetId, request.user?.id, typeof input.title === "string" ? input.title : null, text,
        Array.isArray(input.mediaIds) ? input.mediaIds.slice(0, 10) : [], input.pin === true,
        input.commentsEnabled !== false, typeof input.status === "string" ? input.status : null],
    );
    return { id, assetId, authorId: request.user?.id, body: text, title: typeof input.title === "string" ? input.title : null };
  }

  @Get("assets/:id/events")
  async listEvents(@Param("id") assetId: string) {
    const result = await this.database.pool.query(
      "SELECT * FROM events.events WHERE asset_id=$1 AND cancelled_at IS NULL ORDER BY starts_at",
      [assetId],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("assets/:id/events")
  async createEvent(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    if (typeof input.title !== "string" || typeof input.startsAt !== "string") throw new ApiException(400, "validation_failed", "Title and start time are required");
    const id = randomUUID();
    await this.database.pool.query(
      `INSERT INTO events.events (id,asset_id,creator_id,title,starts_at,ends_at,timezone,place,online_url,description,cover_upload_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, assetId, request.user?.id, input.title, input.startsAt,
        typeof input.endsAt === "string" ? input.endsAt : null,
        typeof input.timezone === "string" ? input.timezone : "Africa/Lagos",
        typeof input.place === "string" ? input.place : null,
        typeof input.onlineUrl === "string" ? input.onlineUrl : null,
        typeof input.description === "string" ? input.description : null,
        typeof input.coverUploadId === "string" ? input.coverUploadId : null],
    );
    return { id, title: input.title, startsAt: input.startsAt };
  }

  @Put("events/:id/rsvp")
  async rsvp(@Param("id") eventId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const state = (body as Record<string, unknown>).state;
    if (!["going", "interested", "not_going"].includes(String(state))) throw new ApiException(400, "validation_failed", "Invalid RSVP state", "state");
    await this.database.pool.query(
      `INSERT INTO events.rsvps (event_id,user_id,state) VALUES ($1,$2,$3)
       ON CONFLICT (event_id,user_id) DO UPDATE SET state=$3,updated_at=now()`,
      [eventId, request.user?.id, state],
    );
    return { ok: true };
  }

  @Get("assets/:id/entries")
  async listEntries(@Param("id") assetId: string) {
    const result = await this.database.pool.query(
      "SELECT * FROM lists.entries WHERE asset_id=$1 AND deleted_at IS NULL ORDER BY pinned DESC,created_at DESC LIMIT 100",
      [assetId],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("assets/:id/entries")
  async createEntry(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    if (typeof input.title !== "string" || !input.title.trim()) throw new ApiException(400, "validation_failed", "Title is required", "title");
    const id = randomUUID();
    await this.database.pool.query(
      "INSERT INTO lists.entries (id,asset_id,author_id,title,url,description,tags,deadline_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, assetId, request.user?.id, input.title, typeof input.url === "string" ? input.url : null,
        typeof input.description === "string" ? input.description : null,
        Array.isArray(input.tags) ? input.tags.slice(0, 20).map(String) : [],
        typeof input.deadlineAt === "string" ? input.deadlineAt : null],
    );
    return { id, assetId, title: input.title };
  }

  @Put("entries/:id/save")
  async saveEntry(@Param("id") entryId: string, @Req() request: ContentRequest) {
    await this.database.pool.query(
      "INSERT INTO lists.saves (entry_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [entryId, request.user?.id],
    );
    return { ok: true };
  }

  @Get("assets/:id/items")
  async listBoardItems(@Param("id") assetId: string) {
    const result = await this.database.pool.query(
      "SELECT * FROM boards.items WHERE asset_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100",
      [assetId],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("assets/:id/items")
  async createBoardItem(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    if (typeof input.title !== "string" || typeof input.stage !== "string") throw new ApiException(400, "validation_failed", "Title and stage are required");
    const id = randomUUID();
    await this.database.pool.query(
      "INSERT INTO boards.items (id,asset_id,owner_id,title,blurb,description,why,needs,stage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, assetId, request.user?.id, input.title, typeof input.blurb === "string" ? input.blurb : null,
        typeof input.description === "string" ? input.description : null,
        typeof input.why === "string" ? input.why : null,
        Array.isArray(input.needs) ? input.needs.slice(0, 20).map(String) : [], input.stage],
    );
    return { id, assetId, title: input.title, stage: input.stage };
  }

  @Post("assets/:id/campaigns")
  async createCampaign(@Param("id") assetId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    if (typeof input.title !== "string" || !input.title.trim()) throw new ApiException(400, "validation_failed", "Title is required", "title");
    const id = randomUUID();
    await this.database.pool.query(
      "INSERT INTO campaigns.campaigns (id,asset_id,creator_id,title,goal,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [id, assetId, request.user?.id, input.title, typeof input.goal === "string" ? input.goal : null,
        typeof input.startsAt === "string" ? input.startsAt : null,
        typeof input.endsAt === "string" ? input.endsAt : null],
    );
    if (Array.isArray(input.tasks)) {
      for (const task of input.tasks.slice(0, 100)) {
        if (!task || typeof task !== "object") continue;
        const value = task as Record<string, unknown>;
        await this.database.pool.query(
          "INSERT INTO campaigns.tasks (id,campaign_id,title,proof_required,points) VALUES ($1,$2,$3,$4,$5)",
          [randomUUID(), id, typeof value.title === "string" ? value.title : "Task",
            value.proofRequired === true, Number.isInteger(value.points) ? Number(value.points) : 10],
        );
      }
    }
    return { id, assetId, title: input.title };
  }

  @Get("assets/:id/campaigns")
  async listCampaigns(@Param("id") assetId: string) {
    const result = await this.database.pool.query(
      "SELECT * FROM campaigns.campaigns WHERE asset_id=$1 AND ended_at IS NULL ORDER BY created_at DESC LIMIT 100",
      [assetId],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("campaigns/:id/join")
  async joinCampaign(@Param("id") campaignId: string, @Req() request: ContentRequest) {
    await this.database.pool.query(
      "INSERT INTO campaigns.participants (campaign_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [campaignId, request.user?.id],
    );
    return { ok: true };
  }

  @Post("tasks/:id/complete")
  async completeTask(@Param("id") taskId: string, @Req() request: ContentRequest, @Body() body: unknown) {
    const proof = typeof (body as Record<string, unknown>).proof === "string" ? (body as Record<string, unknown>).proof : null;
    await this.database.pool.query(
      "INSERT INTO campaigns.completions (id,task_id,user_id,proof,status) VALUES ($1,$2,$3,$4,'pending') ON CONFLICT (task_id,user_id) DO NOTHING",
      [randomUUID(), taskId, request.user?.id, proof],
    );
    return { ok: true };
  }
}
