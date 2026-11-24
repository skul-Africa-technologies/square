import { randomUUID } from "node:crypto";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService, RedisService } from "@square/kernel";

type ConversationRequest = FastifyRequest & { user?: AuthenticatedUser };

function mentionRows(text: string) {
  return [...text.matchAll(/(?:^|[^A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_-]{1,63})/g)]
    .map(match => match[1].toLowerCase())
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 5);
}

@Controller()
export class ConversationController {
  constructor(private readonly database: DatabaseService, private readonly redis: RedisService) {}

  @Get("assets/:id/messages")
  async chatMessages(@Param("id") assetId: string, @Req() request: ConversationRequest,
    @Query("before") before?: string, @Query("limit") limitValue?: string) {
    const limit = Math.min(100, Math.max(1, Number(limitValue || 30)));
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT m.id,m.asset_id,m.author_id,m.body,COALESCE(m.body,m.content,'') AS content,
              m.reply_to_id,m.seq,m.created_at,m.edited_at,m.deleted_at,m.solved_at,
              p.username AS author_username,p.avatar_url AS author_avatar
       FROM chat.messages m
       JOIN users.profiles p ON p.id=m.author_id
       JOIN assets.assets a ON a.id=m.asset_id
       LEFT JOIN communities.memberships membership ON membership.community_id=a.community_id AND membership.user_id=$2
       WHERE m.asset_id=$1 AND m.deleted_at IS NULL
         AND ($3::text IS NULL OR m.id < $3)
         AND (a.is_public OR membership.role IS NOT NULL)
       ORDER BY m.seq DESC,m.id DESC LIMIT $4`,
      [assetId, request.user?.id, before || null, limit],
    );
    return { items: result.rows, page: { next: result.rows.at(-1)?.id ?? null, prev: null } };
  }

  @Post("assets/:id/messages")
  async sendChat(@Param("id") assetId: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    const text = typeof input.body === "string" ? input.body : typeof input.text === "string" ? input.text : "";
    if (!text.trim()) throw new ApiException(400, "validation_failed", "Message is required", "body");
    if (text.length > 2000) throw new ApiException(400, "message_too_long", "Message is too long");
    const clientMsgId = typeof input.clientMsgId === "string" ? input.clientMsgId : randomUUID();
    return this.database.transaction(async (client) => {
      const existing = await client.query<Record<string, unknown>>(
        "SELECT * FROM chat.messages WHERE asset_id=$1 AND client_msg_id=$2",
        [assetId, clientMsgId],
      );
      if (existing.rows[0]) return existing.rows[0];
      const access = await client.query<{ can_post_roles: string[]; role: string | null }>(
        `SELECT a.can_post_roles,m.role
         FROM assets.assets a
         JOIN communities.communities c ON c.id=a.community_id
         LEFT JOIN communities.memberships m ON m.community_id=c.id AND m.user_id=$2
         WHERE a.id=$1`,
        [assetId, request.user?.id],
      );
      const row = access.rows[0];
      if (!row || (row.role ? !row.can_post_roles.includes(row.role) : !row.can_post_roles.includes("member"))) {
        throw new ApiException(403, "asset_forbidden", "You cannot post here");
      }
      const seq = Number(await this.redis.client.hincrby(`seq:${assetId}`, "seq", 1));
      const id = randomUUID();
      await client.query(
        `INSERT INTO chat.messages (
          id,asset_id,author_id,body,content,reply_to_id,seq,client_msg_id,created_at
        ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,now())`,
        [id, assetId, request.user?.id, text, typeof input.replyToId === "string" ? input.replyToId : null, seq, clientMsgId],
      );
      const names = mentionRows(text);
      for (const name of names) {
        const mentioned = await client.query<{ id: string }>(
          "SELECT id FROM users.profiles WHERE lower(username)=lower($1)",
          [name],
        );
        if (mentioned.rows[0]) {
          await client.query(
            "INSERT INTO chat.mentions (id,message_id,user_id,asset_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [randomUUID(), id, mentioned.rows[0].id, assetId],
          );
          await this.redis.client.hincrby(`ment:${mentioned.rows[0].id}`, assetId, 1);
        }
      }
      const result = await client.query<Record<string, unknown>>(
        `SELECT m.*,p.username AS author_username,p.avatar_url AS author_avatar
         FROM chat.messages m JOIN users.profiles p ON p.id=m.author_id WHERE m.id=$1`,
        [id],
      );
      return result.rows[0];
    });
  }

  @Patch("messages/:id")
  async editChat(@Param("id") id: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const text = (body as Record<string, unknown>).body;
    if (typeof text !== "string" || text.length > 2000) throw new ApiException(400, "validation_failed", "Invalid message body", "body");
    const result = await this.database.pool.query(
      "UPDATE chat.messages SET body=$1,content=$1,edited_at=now() WHERE id=$2 AND author_id=$3 AND deleted_at IS NULL RETURNING id",
      [text, id, request.user?.id],
    );
    if (!result.rowCount) throw new ApiException(404, "not_found", "Message not found");
    return { ok: true };
  }

  @Delete("messages/:id")
  async deleteChat(@Param("id") id: string, @Req() request: ConversationRequest) {
    const result = await this.database.pool.query(
      "UPDATE chat.messages SET deleted_at=now(),body='' WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL RETURNING id",
      [id, request.user?.id],
    );
    if (!result.rowCount) throw new ApiException(404, "not_found", "Message not found");
    return { ok: true };
  }

  @Post("assets/:id/read")
  async markAssetRead(@Param("id") assetId: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const seq = typeof (body as Record<string, unknown>).seq === "number"
      ? Number((body as Record<string, unknown>).seq)
      : 0;
    await this.database.pool.query(
      `INSERT INTO chat.read_cursors (asset_id,user_id,seq)
       VALUES ($1,$2,$3)
       ON CONFLICT (asset_id,user_id) DO UPDATE SET seq=GREATEST(chat.read_cursors.seq,$3),updated_at=now()`,
      [assetId, request.user?.id, seq],
    );
    return { ok: true };
  }

  @Get("assets/:id/mentions")
  async chatMentions(@Param("id") assetId: string, @Req() request: ConversationRequest) {
    const result = await this.database.pool.query<{ message_id: string; seq: number; created_at: Date }>(
      `SELECT mention.message_id,message.seq,mention.created_at
       FROM chat.mentions mention
       JOIN chat.messages message ON message.id=mention.message_id
       WHERE mention.asset_id=$1 AND mention.user_id=$2 AND mention.seen_at IS NULL
       ORDER BY message.seq`,
      [assetId, request.user?.id],
    );
    return result.rows.map(row => ({ messageId: row.message_id, seq: Number(row.seq), createdAt: row.created_at.toISOString() }));
  }

  @Post("assets/:id/mentions/seen")
  async seenChatMentions(@Param("id") assetId: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    if (input.all === true) {
      await this.database.pool.query(
        "UPDATE chat.mentions SET seen_at=now() WHERE asset_id=$1 AND user_id=$2 AND seen_at IS NULL",
        [assetId, request.user?.id],
      );
    } else if (Array.isArray(input.messageIds)) {
      await this.database.pool.query(
        "UPDATE chat.mentions SET seen_at=now() WHERE asset_id=$1 AND user_id=$2 AND message_id=ANY($3::text[])",
        [assetId, request.user?.id, input.messageIds.slice(0, 200)],
      );
    } else {
      throw new ApiException(400, "validation_failed", "Provide messageIds or all");
    }
    return { ok: true };
  }

  @Get("dm/conversations")
  async dmList(@Req() request: ConversationRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT c.id,c.created_at,p.username,p.id AS participant_id,p.avatar_url,
              (SELECT body FROM dm.messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL ORDER BY seq DESC LIMIT 1) AS last_message
       FROM dm.conversations c
       JOIN dm.participants mine ON mine.conversation_id=c.id AND mine.user_id=$1
       JOIN dm.participants peer ON peer.conversation_id=c.id AND peer.user_id<>$1
       JOIN users.profiles p ON p.id=peer.user_id
       ORDER BY c.created_at DESC`,
      [request.user?.id],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("dm/conversations")
  async createDm(@Req() request: ConversationRequest, @Body() body: unknown) {
    const username = (body as Record<string, unknown>).username;
    if (typeof username !== "string") throw new ApiException(400, "validation_failed", "Username is required", "username");
    const peer = await this.database.pool.query<{ id: string }>(
      "SELECT id FROM users.profiles WHERE lower(username)=lower($1)",
      [username.replace(/^#/, "")],
    );
    if (!peer.rows[0]) throw new ApiException(404, "not_found", "User not found");
    if (peer.rows[0].id === request.user?.id) throw new ApiException(400, "dm_closed", "You cannot message yourself");
    const blocked = await this.database.pool.query(
      `SELECT 1 FROM users.blocks
       WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1`,
      [request.user?.id, peer.rows[0].id],
    );
    if (blocked.rowCount) throw new ApiException(403, "dm_blocked", "You can't message this user");
    const pair = [String(request.user?.id), peer.rows[0].id].sort().join(":");
    const conversation = await this.database.transaction(async (client) => {
      const found = await client.query<{ id: string }>(
        `INSERT INTO dm.conversations (id,pair_key) VALUES ($1,$2)
         ON CONFLICT (pair_key) DO UPDATE SET pair_key=EXCLUDED.pair_key
         RETURNING id`,
        [randomUUID(), pair],
      );
      const id = found.rows[0].id;
      await client.query(
        "INSERT INTO dm.participants (conversation_id,user_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING",
        [id, request.user?.id, peer.rows[0].id],
      );
      return id;
    });
    return { id: conversation, participantId: peer.rows[0].id };
  }

  @Get("dm/conversations/:id/messages")
  async dmMessages(@Param("id") id: string, @Req() request: ConversationRequest) {
    const participant = await this.database.pool.query(
      "SELECT 1 FROM dm.participants WHERE conversation_id=$1 AND user_id=$2",
      [id, request.user?.id],
    );
    if (!participant.rowCount) throw new ApiException(404, "not_found", "Conversation not found");
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT m.*,p.username AS author_username,p.avatar_url AS author_avatar
       FROM dm.messages m JOIN users.profiles p ON p.id=m.author_id
       WHERE m.conversation_id=$1 AND m.deleted_at IS NULL
       ORDER BY m.seq DESC,m.id DESC LIMIT 100`,
      [id],
    );
    return { items: result.rows, page: { next: null, prev: null } };
  }

  @Post("dm/conversations/:id/messages")
  async sendDm(@Param("id") id: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    const text = typeof input.body === "string" ? input.body : typeof input.text === "string" ? input.text : "";
    if (!text.trim() || text.length > 2000) throw new ApiException(400, "message_too_long", "Invalid message");
    const participant = await this.database.pool.query(
      "SELECT 1 FROM dm.participants WHERE conversation_id=$1 AND user_id=$2",
      [id, request.user?.id],
    );
    if (!participant.rowCount) throw new ApiException(404, "not_found", "Conversation not found");
    const seq = Number(await this.redis.client.hincrby(`dmseq:${id}`, "seq", 1));
    const messageId = randomUUID();
    await this.database.pool.query(
      "INSERT INTO dm.messages (id,conversation_id,author_id,body,reply_to_id,seq,client_msg_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())",
      [messageId, id, request.user?.id, text, typeof input.replyToId === "string" ? input.replyToId : null, seq, typeof input.clientMsgId === "string" ? input.clientMsgId : messageId],
    );
    return { id: messageId, conversationId: id, body: text, seq, createdAt: new Date().toISOString(), authorId: request.user?.id };
  }

  @Post("dm/conversations/:id/read")
  async readDm(@Param("id") id: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const seq = Number((body as Record<string, unknown>).seq || 0);
    await this.database.pool.query(
      `INSERT INTO dm.read_cursors (conversation_id,user_id,seq) VALUES ($1,$2,$3)
       ON CONFLICT (conversation_id,user_id) DO UPDATE SET seq=GREATEST(dm.read_cursors.seq,$3)`,
      [id, request.user?.id, seq],
    );
    return { ok: true };
  }
}
