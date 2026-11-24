import { randomUUID } from "node:crypto";
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser, BackendConfig } from "@square/kernel";
import { ApiException, DatabaseService, RedisService } from "@square/kernel";
import { unreadSummarySchema } from "@square/shared";
import { z } from "zod";
import { BACKEND_CONFIG } from "./tokens";

type ConversationRequest = FastifyRequest & { user?: AuthenticatedUser };

const sendMessageSchema = z.object({
  body: z.string().max(2000).optional(),
  text: z.string().max(2000).optional(),
  clientMsgId: z.string().min(1).max(128).optional(),
  replyToId: z.string().min(1).max(128).optional(),
  replyPreview: z.unknown().optional(),
}).strict();
const readCursorSchema = z.object({ seq: z.number().int().nonnegative().safe().optional() }).strict().default({});
const dmStartSchema = z.object({ username: z.string().trim().min(1).max(64) }).strict();
const mentionSeenSchema = z.union([
  z.object({ messageIds: z.array(z.string().min(1).max(128)).min(1).max(200) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

function parseSendMessage(body: unknown) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const bodyText = "body" in body ? body.body : undefined;
    const text = "text" in body ? body.text : undefined;
    if ([bodyText, text].some(value => typeof value === "string" && value.length > 2000)) {
      throw new ApiException(400, "message_too_long", "Invalid message");
    }
  }
  return sendMessageSchema.parse(body);
}

function mentionRows(text: string) {
  return [...text.matchAll(/(?:^|[^A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_-]{1,63})/g)]
    .map(match => match[1].toLowerCase())
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 5);
}

@Controller()
export class ConversationController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    @Inject(BACKEND_CONFIG) private readonly config: Pick<BackendConfig, "DM_ENABLED">,
  ) {}

  private assertDirectMessagesEnabled() {
    if (!this.config.DM_ENABLED) throw new ApiException(403, "dm_closed", "Direct messages are unavailable");
  }

  @Get("me/unread")
  async unreadSummary(@Req() request: ConversationRequest) {
    const userId = request.user?.id;
    if (!userId) throw new ApiException(401, "unauthenticated", "Sign in to continue");

    const [assets, dm] = await Promise.all([
      this.database.pool.query<{ assetId: string; unread: number; mentions: number }>(
        `SELECT asset.id AS "assetId",
                (COUNT(message.id) FILTER (
                  WHERE message.author_id<>$1 AND message.seq>COALESCE(cursor.seq,0)
                ))::int AS unread,
                (COUNT(DISTINCT mention.id) FILTER (
                  WHERE mention.seen_at IS NULL AND message.author_id<>$1
                    AND message.seq>COALESCE(cursor.seq,0)
                ))::int AS mentions
         FROM assets.assets asset
         JOIN communities.communities community ON community.id=asset.community_id
         JOIN communities.memberships membership
           ON membership.community_id=asset.community_id AND membership.user_id=$1
         LEFT JOIN chat.read_cursors cursor ON cursor.asset_id=asset.id AND cursor.user_id=$1
         LEFT JOIN chat.messages message ON message.asset_id=asset.id AND message.deleted_at IS NULL
         LEFT JOIN chat.mentions mention ON mention.message_id=message.id AND mention.user_id=$1
         WHERE asset.deleted_at IS NULL AND community.deleted_at IS NULL
           AND membership.role=ANY(asset.can_read_roles)
           AND (NOT asset.hidden_from_members OR membership.role IN ('owner','moderator'))
         GROUP BY asset.id,cursor.seq`,
        [userId],
      ),
      this.database.pool.query<{ unread: number; mentions: number }>(
        `SELECT
           (COUNT(message.id) FILTER (
             WHERE message.author_id<>$1 AND message.seq>COALESCE(cursor.seq,0)
           ))::int AS unread,
           (COUNT(DISTINCT mention.id) FILTER (
             WHERE mention.seen_at IS NULL AND message.author_id<>$1
               AND message.seq>COALESCE(cursor.seq,0)
           ))::int AS mentions
         FROM dm.participants participant
         LEFT JOIN dm.read_cursors cursor
           ON cursor.conversation_id=participant.conversation_id AND cursor.user_id=$1
         LEFT JOIN dm.messages message
           ON message.conversation_id=participant.conversation_id AND message.deleted_at IS NULL
         LEFT JOIN dm.mentions mention
           ON mention.message_id=message.id AND mention.user_id=$1
         WHERE participant.user_id=$1`,
        [userId],
      ),
    ]);

    return unreadSummarySchema.parse({
      dm: dm.rows[0] ?? { unread: 0, mentions: 0 },
      assets: assets.rows.filter((asset) => asset.unread > 0),
    });
  }

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
       JOIN communities.communities community ON community.id=a.community_id
       LEFT JOIN communities.memberships membership ON membership.community_id=a.community_id AND membership.user_id=$2
       WHERE m.asset_id=$1 AND m.deleted_at IS NULL AND a.deleted_at IS NULL
         AND ($3::text IS NULL OR (m.seq,m.id) < (
           SELECT cursor.seq,cursor.id FROM chat.messages cursor
           WHERE cursor.id=$3 AND cursor.asset_id=$1
         ))
         AND (
           (membership.role IS NOT NULL AND a.can_read_roles @> ARRAY[membership.role])
           OR (membership.role IS NULL AND community.is_public AND a.is_public)
         )
         AND (NOT a.hidden_from_members OR membership.role IN ('owner','moderator'))
         AND community.deleted_at IS NULL
       ORDER BY m.seq DESC,m.id DESC LIMIT $4`,
      [assetId, request.user?.id, before || null, limit],
    );
    return { items: result.rows, page: { next: result.rows.at(-1)?.id ?? null, prev: null } };
  }

  @Post("assets/:id/messages")
  async sendChat(@Param("id") assetId: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const input = parseSendMessage(body);
    const text = input.body ?? input.text ?? "";
    if (!text.trim()) throw new ApiException(400, "validation_failed", "Message is required", "body");
    const clientMsgId = input.clientMsgId ?? randomUUID();
    return this.database.transaction(async (client) => {
      const access = await client.query<{ can_post_roles: string[]; role: string | null; hidden_from_members: boolean }>(
        `SELECT a.can_post_roles,m.role,a.hidden_from_members
         FROM assets.assets a
         JOIN communities.communities c ON c.id=a.community_id
         LEFT JOIN communities.memberships m ON m.community_id=c.id AND m.user_id=$2
         WHERE a.id=$1 AND a.deleted_at IS NULL AND c.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM communities.member_restrictions restriction
           WHERE restriction.community_id=c.id AND restriction.user_id=$2
             AND (restriction.restriction='banned'
               OR (restriction.restriction='timeout' AND restriction.expires_at>now()))
         )`,
        [assetId, request.user?.id],
      );
      const row = access.rows[0];
      if (
        !row ||
        !row.role ||
        !row.can_post_roles.includes(row.role) ||
        (row.hidden_from_members && !["owner", "moderator"].includes(row.role))
      ) {
        throw new ApiException(403, "asset_forbidden", "You cannot post here");
      }

      const existing = await client.query<Record<string, unknown>>(
        "SELECT * FROM chat.messages WHERE asset_id=$1 AND client_msg_id=$2",
        [assetId, clientMsgId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].author_id !== request.user?.id) {
          throw new ApiException(409, "conflict", "Message id was already used");
        }
        return existing.rows[0];
      }
      if (input.replyToId) {
        const reply = await client.query(
          "SELECT 1 FROM chat.messages WHERE id=$1 AND asset_id=$2 AND deleted_at IS NULL",
          [input.replyToId, assetId],
        );
        if (!reply.rowCount) throw new ApiException(404, "not_found", "Reply target not found");
      }
      const seq = Number(await this.redis.client.hincrby(`seq:${assetId}`, "seq", 1));
      const id = randomUUID();
      await client.query(
        `INSERT INTO chat.messages (
          id,asset_id,author_id,body,content,reply_to_id,seq,client_msg_id,created_at
        ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,now())`,
        [id, assetId, request.user?.id, text, input.replyToId ?? null, seq, clientMsgId],
      );
      const names = mentionRows(text);
      for (const name of names) {
        const mentioned = await client.query<{ id: string }>(
          `SELECT profile.id FROM users.profiles profile
           JOIN communities.memberships membership ON membership.user_id=profile.id
           JOIN assets.assets asset ON asset.community_id=membership.community_id
           WHERE asset.id=$2 AND lower(profile.username)=lower($1)
             AND profile.deleted_at IS NULL AND profile.id<>$3`,
          [name, assetId, request.user?.id],
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
    const input = z.object({ body: z.string().trim().min(1).max(2000) }).strict().parse(body);
    const result = await this.database.pool.query(
      `UPDATE chat.messages message SET body=$1,content=$1,edited_at=now()
       FROM assets.assets asset
       JOIN communities.memberships membership ON membership.community_id=asset.community_id
       WHERE message.id=$2 AND message.author_id=$3 AND message.asset_id=asset.id
         AND membership.user_id=$3 AND message.deleted_at IS NULL AND asset.deleted_at IS NULL
       RETURNING message.id`,
      [input.body, id, request.user?.id],
    );
    if (!result.rowCount) throw new ApiException(404, "not_found", "Message not found");
    return { ok: true };
  }

  @Delete("messages/:id")
  async deleteChat(@Param("id") id: string, @Req() request: ConversationRequest) {
    const result = await this.database.pool.query(
      `UPDATE chat.messages message SET deleted_at=now(),body=''
       FROM assets.assets asset
       JOIN communities.memberships membership ON membership.community_id=asset.community_id
       WHERE message.id=$1 AND message.author_id=$2 AND message.asset_id=asset.id
         AND membership.user_id=$2 AND message.deleted_at IS NULL AND asset.deleted_at IS NULL
       RETURNING message.id`,
      [id, request.user?.id],
    );
    if (!result.rowCount) throw new ApiException(404, "not_found", "Message not found");
    return { ok: true };
  }

  @Post("assets/:id/read")
  async markAssetRead(@Param("id") assetId: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const input = readCursorSchema.parse(body);
    const access = await this.database.pool.query<{ latest_seq: number | string }>(
      `SELECT COALESCE((SELECT MAX(message.seq) FROM chat.messages message WHERE message.asset_id=asset.id),0) AS latest_seq
       FROM assets.assets asset
       JOIN communities.communities community ON community.id=asset.community_id
       JOIN communities.memberships membership ON membership.community_id=asset.community_id
       WHERE asset.id=$1 AND membership.user_id=$2 AND asset.deleted_at IS NULL
         AND community.deleted_at IS NULL
         AND membership.role=ANY(asset.can_read_roles)
         AND (NOT asset.hidden_from_members OR membership.role IN ('owner','moderator'))`,
      [assetId, request.user?.id],
    );
    const row = access.rows[0];
    if (!row) throw new ApiException(404, "not_found", "Asset not found");
    const seq = Math.min(input.seq ?? Number(row.latest_seq), Number(row.latest_seq));
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
       JOIN assets.assets asset ON asset.id=mention.asset_id
       JOIN communities.memberships membership ON membership.community_id=asset.community_id
         WHERE mention.asset_id=$1 AND mention.user_id=$2 AND membership.user_id=$2
           AND membership.role=ANY(asset.can_read_roles)
           AND (NOT asset.hidden_from_members OR membership.role IN ('owner','moderator'))
           AND asset.deleted_at IS NULL
         AND mention.seen_at IS NULL
       ORDER BY message.seq`,
      [assetId, request.user?.id],
    );
    return result.rows.map(row => ({ messageId: row.message_id, seq: Number(row.seq), createdAt: row.created_at.toISOString() }));
  }

  @Post("assets/:id/mentions/seen")
  async seenChatMentions(@Param("id") assetId: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    const input = mentionSeenSchema.parse(body);
    if ("all" in input) {
      await this.database.pool.query(
        `UPDATE chat.mentions mention SET seen_at=now()
         WHERE mention.asset_id=$1 AND mention.user_id=$2 AND mention.seen_at IS NULL
           AND EXISTS (
             SELECT 1 FROM assets.assets asset
             JOIN communities.memberships membership ON membership.community_id=asset.community_id
             WHERE asset.id=mention.asset_id AND membership.user_id=$2
           )`,
        [assetId, request.user?.id],
      );
    } else {
      await this.database.pool.query(
        `UPDATE chat.mentions mention SET seen_at=now()
         WHERE mention.asset_id=$1 AND mention.user_id=$2 AND mention.message_id=ANY($3::text[])
           AND EXISTS (
             SELECT 1 FROM assets.assets asset
             JOIN communities.memberships membership ON membership.community_id=asset.community_id
             WHERE asset.id=mention.asset_id AND membership.user_id=$2
           )`,
        [assetId, request.user?.id, input.messageIds],
      );
    }
    return { ok: true };
  }

  @Get("dm/conversations")
  async dmList(@Req() request: ConversationRequest) {
    this.assertDirectMessagesEnabled();
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
    this.assertDirectMessagesEnabled();
    const { username } = dmStartSchema.parse(body);
    const peer = await this.database.pool.query<{ id: string }>(
      "SELECT id FROM users.profiles WHERE lower(username)=lower($1) AND deleted_at IS NULL",
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
    this.assertDirectMessagesEnabled();
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
    this.assertDirectMessagesEnabled();
    const input = parseSendMessage(body);
    const text = input.body ?? input.text ?? "";
    if (!text.trim()) throw new ApiException(400, "validation_failed", "Message is required", "body");
    const participant = await this.database.pool.query<{ peer_id: string }>(
      `SELECT peer.user_id AS peer_id
       FROM dm.participants mine
       JOIN dm.participants peer ON peer.conversation_id=mine.conversation_id AND peer.user_id<>mine.user_id
       WHERE mine.conversation_id=$1 AND mine.user_id=$2`,
      [id, request.user?.id],
    );
    if (!participant.rows[0]) throw new ApiException(404, "not_found", "Conversation not found");
    const blocked = await this.database.pool.query(
      `SELECT 1 FROM users.blocks
       WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1`,
      [request.user?.id, participant.rows[0].peer_id],
    );
    if (blocked.rowCount) throw new ApiException(403, "dm_blocked", "You can't message this user");
    const clientMsgId = input.clientMsgId ?? randomUUID();
    const existing = await this.database.pool.query<Record<string, unknown>>(
      "SELECT * FROM dm.messages WHERE conversation_id=$1 AND client_msg_id=$2",
      [id, clientMsgId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].author_id !== request.user?.id) {
        throw new ApiException(409, "conflict", "Message id was already used");
      }
      return existing.rows[0];
    }
    if (input.replyToId) {
      const reply = await this.database.pool.query(
        "SELECT 1 FROM dm.messages WHERE id=$1 AND conversation_id=$2 AND deleted_at IS NULL",
        [input.replyToId, id],
      );
      if (!reply.rowCount) throw new ApiException(404, "not_found", "Reply target not found");
    }
    const seq = Number(await this.redis.client.hincrby(`dmseq:${id}`, "seq", 1));
    const messageId = randomUUID();
    const inserted = await this.database.pool.query<{ id: string }>(
      `INSERT INTO dm.messages
         (id,conversation_id,author_id,body,sender_id,content,reply_to_id,seq,client_msg_id,created_at)
       VALUES ($1,$2,$3,$4,$3,$4,$5,$6,$7,now())
       ON CONFLICT (conversation_id,client_msg_id) DO NOTHING
       RETURNING id`,
      [messageId, id, request.user?.id, text, input.replyToId ?? null, seq, clientMsgId],
    );
    if (!inserted.rowCount) {
      const duplicate = await this.database.pool.query<Record<string, unknown>>(
        "SELECT * FROM dm.messages WHERE conversation_id=$1 AND client_msg_id=$2",
        [id, clientMsgId],
      );
      if (duplicate.rows[0]?.author_id !== request.user?.id) {
        throw new ApiException(409, "conflict", "Message id was already used");
      }
      return duplicate.rows[0];
    }
    return { id: messageId, conversationId: id, body: text, seq, createdAt: new Date().toISOString(), authorId: request.user?.id };
  }

  @Post("dm/conversations/:id/read")
  async readDm(@Param("id") id: string, @Req() request: ConversationRequest, @Body() body: unknown) {
    this.assertDirectMessagesEnabled();
    const input = readCursorSchema.parse(body);
    const access = await this.database.pool.query<{ latest_seq: number | string }>(
      `SELECT COALESCE((SELECT MAX(message.seq) FROM dm.messages message WHERE message.conversation_id=conversation.id),0) AS latest_seq
       FROM dm.conversations conversation
       JOIN dm.participants participant ON participant.conversation_id=conversation.id
       WHERE conversation.id=$1 AND participant.user_id=$2`,
      [id, request.user?.id],
    );
    const row = access.rows[0];
    if (!row) throw new ApiException(404, "not_found", "Conversation not found");
    const seq = Math.min(input.seq ?? Number(row.latest_seq), Number(row.latest_seq));
    await this.database.pool.query(
      `INSERT INTO dm.read_cursors (conversation_id,user_id,seq) VALUES ($1,$2,$3)
       ON CONFLICT (conversation_id,user_id) DO UPDATE SET seq=GREATEST(dm.read_cursors.seq,$3)`,
      [id, request.user?.id, seq],
    );
    return { ok: true };
  }
}
