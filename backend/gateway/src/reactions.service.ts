import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  ApiException,
  DatabaseService,
  RedisRateLimiter,
  decodeCursor,
  encodeCursor,
  insertOutboxEvent,
  type AuthenticatedUser,
} from "@square/kernel";
import { isAllowedReactionEmoji, type ReactionScope, type ReactionSummary } from "@square/shared";
import type { PoolClient } from "pg";

type MessageContext = {
  roomId: string;
  deletedAt: Date | null;
};

type AssetMessageRow = {
  asset_id: string;
  community_id: string;
  deleted_at: Date | null;
  is_public: boolean;
  can_read_roles: string[];
  can_post_roles: string[];
  role: string | null;
};

const tables = {
  asset: { messages: "chat.messages", reactions: "chat.reactions", counts: "chat.reaction_counts" },
  dm: { messages: "dm.messages", reactions: "dm.reactions", counts: "dm.reaction_counts" },
} as const;

@Injectable()
export class ReactionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly rateLimiter: RedisRateLimiter,
  ) {}

  async hydrateMessageReactions(
    scope: ReactionScope,
    messageIds: string[],
    userId: string,
  ): Promise<Map<string, ReactionSummary[]>> {
    const reactionsByMessage = new Map<string, ReactionSummary[]>();
    if (messageIds.length === 0) return reactionsByMessage;
    for (const messageId of messageIds) reactionsByMessage.set(messageId, []);
    const table = tables[scope];
    const [counts, mine] = await Promise.all([
      this.database.pool.query<{ message_id: string; emoji: string; count: number }>(
        `SELECT message_id, emoji, count
         FROM ${table.counts}
         WHERE message_id = ANY($1::text[])
         ORDER BY message_id, first_at`,
        [messageIds],
      ),
      this.database.pool.query<{ message_id: string; emoji: string }>(
        `SELECT message_id, emoji
         FROM ${table.reactions}
         WHERE user_id = $1 AND message_id = ANY($2::text[])`,
        [userId, messageIds],
      ),
    ]);
    const mineByMessage = new Map<string, Set<string>>();
    for (const row of mine.rows) {
      const emojis = mineByMessage.get(row.message_id) || new Set<string>();
      emojis.add(row.emoji);
      mineByMessage.set(row.message_id, emojis);
    }
    for (const row of counts.rows) {
      const reactions = reactionsByMessage.get(row.message_id) || [];
      reactions.push({
        emoji: row.emoji,
        count: row.count,
        me: mineByMessage.get(row.message_id)?.has(row.emoji) ?? false,
      });
      reactionsByMessage.set(row.message_id, reactions);
    }
    return reactionsByMessage;
  }

  async reconcileCounts(): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(7281439027654321) AS acquired",
      );
      if (!lock.rows[0]?.acquired) return false;
      await client.query("SELECT chat.reconcile_reaction_counts()");
      await client.query("SELECT dm.reconcile_reaction_counts()");
      return true;
    });
  }

  async toggle(
    scope: ReactionScope,
    messageId: string,
    emoji: string,
    user: AuthenticatedUser,
    add: boolean,
    clientId?: string,
  ): Promise<void> {
    this.validateEmoji(emoji);
    if (clientId && (clientId.length > 128 || /[\r\n]/.test(clientId))) {
      throw new ApiException(400, "validation_failed", "Invalid idempotency key", "Idempotency-Key");
    }
    await this.consumeWriteLimits(user);

    await this.database.transaction(async (client) => {
      const context = scope === "asset"
        ? await this.assertAssetAccess(client, messageId, user.id, "post", true)
        : await this.assertDmAccess(client, messageId, user.id, true);
      const table = tables[scope];
      const own = await client.query(
        `SELECT 1 FROM ${table.reactions} WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, user.id, emoji],
      );

      if (add) {
        if (own.rowCount) return;
        const [distinct, perUser, existingEmoji] = await Promise.all([
          client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table.counts} WHERE message_id = $1`, [messageId]),
          client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table.reactions} WHERE message_id = $1 AND user_id = $2`, [messageId, user.id]),
          client.query(`SELECT 1 FROM ${table.counts} WHERE message_id = $1 AND emoji = $2`, [messageId, emoji]),
        ]);
        if (Number(perUser.rows[0]?.count || 0) >= 10 || (!existingEmoji.rowCount && Number(distinct.rows[0]?.count || 0) >= 20)) {
          throw new ApiException(409, "reaction_limit_reached", "Reaction limit reached");
        }
        const inserted = await client.query(
          `INSERT INTO ${table.reactions} (message_id, user_id, emoji)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING
           RETURNING 1`,
          [messageId, user.id, emoji],
        );
        if (!inserted.rowCount) return;
        const result = await client.query<{ count: number }>(
          `INSERT INTO ${table.counts} AS current_count (message_id, emoji, count, first_at)
           VALUES ($1, $2, 1, now())
           ON CONFLICT (message_id, emoji) DO UPDATE
             SET count = current_count.count + 1
           RETURNING count`,
          [messageId, emoji],
        );
        await this.emitToggle(client, scope, context.roomId, messageId, emoji, result.rows[0].count, "add", user.id, clientId);
      } else {
        const removed = await client.query(
          `DELETE FROM ${table.reactions}
           WHERE message_id = $1 AND user_id = $2 AND emoji = $3
           RETURNING 1`,
          [messageId, user.id, emoji],
        );
        if (!removed.rowCount) return;
        const countResult = await client.query<{ count: number }>(
          `UPDATE ${table.counts}
           SET count = count - 1
           WHERE message_id = $1 AND emoji = $2 AND count > 1
           RETURNING count`,
          [messageId, emoji],
        );
        let count = countResult.rows[0]?.count ?? 0;
        if (count === 0) await client.query(`DELETE FROM ${table.counts} WHERE message_id = $1 AND emoji = $2`, [messageId, emoji]);
        await this.emitToggle(client, scope, context.roomId, messageId, emoji, count, "remove", user.id, clientId);
      }
    });
  }

  async listUsers(
    scope: ReactionScope,
    messageId: string,
    emoji: string,
    user: AuthenticatedUser,
    cursorValue?: string,
  ) {
    this.validateEmoji(emoji);
    await this.consumeLimit("reaction-users", user.id, 60, 60_000);
    const cursor = this.decodeUsersCursor(cursorValue);
    return this.database.transaction(async (client) => {
      if (scope === "asset") await this.assertAssetAccess(client, messageId, user.id, "read", false);
      else await this.assertDmAccess(client, messageId, user.id, false);
      const table = tables[scope];
      const cursorDate = cursor?.score === undefined ? null : new Date(cursor.score);
      const result = await client.query<{
        user_id: string;
        username: string;
        avatar_url: string | null;
        created_at: Date;
      }>(
        `SELECT reaction.user_id, profile.username, profile.avatar_url, reaction.created_at
         FROM ${table.reactions} reaction
         JOIN users.profiles profile ON profile.id = reaction.user_id
         WHERE reaction.message_id = $1 AND reaction.emoji = $2
           AND ($3::timestamptz IS NULL OR (reaction.created_at, reaction.user_id) > ($3::timestamptz, $4::text))
           AND NOT EXISTS (
             SELECT 1 FROM users.blocks block
             WHERE (block.blocker_id = $5 AND block.blocked_id = reaction.user_id)
                OR (block.blocker_id = reaction.user_id AND block.blocked_id = $5)
           )
         ORDER BY reaction.created_at, reaction.user_id
         LIMIT 21`,
        [messageId, emoji, cursorDate, cursor?.id ?? null, user.id],
      );
      const hasMore = result.rows.length > 20;
      const rows = result.rows.slice(0, 20);
      const last = rows.at(-1);
      return {
        items: rows.map(row => ({
          id: row.user_id,
          username: row.username,
          avatarUrl: row.avatar_url || undefined,
          me: row.user_id === user.id,
        })),
        nextCursor: hasMore && last
          ? encodeCursor({ id: last.user_id, score: last.created_at.getTime() })
          : null,
      };
    });
  }

  async clearAssetMessage(
    messageId: string,
    user: AuthenticatedUser,
    emoji?: string,
  ): Promise<void> {
    if (emoji !== undefined) this.validateEmoji(emoji);
    await this.database.transaction(async (client) => {
      const context = await this.assertAssetAccess(client, messageId, user.id, "moderate", true);
      const rows = await client.query<{ emoji: string; count: number }>(
        `SELECT emoji, count FROM chat.reaction_counts WHERE message_id = $1 ${emoji === undefined ? "" : "AND emoji = $2"} ORDER BY first_at, emoji`,
        emoji === undefined ? [messageId] : [messageId, emoji],
      );
      if (emoji === undefined) {
        await client.query("DELETE FROM chat.reactions WHERE message_id = $1", [messageId]);
        await client.query("DELETE FROM chat.reaction_counts WHERE message_id = $1", [messageId]);
      } else {
        await client.query("DELETE FROM chat.reactions WHERE message_id = $1 AND emoji = $2", [messageId, emoji]);
        await client.query("DELETE FROM chat.reaction_counts WHERE message_id = $1 AND emoji = $2", [messageId, emoji]);
      }
      await client.query(
        `INSERT INTO moderation.audit_log (id, actor_id, action, room_scope, room_id, message_id, emoji, metadata)
         VALUES ($1, $2, $3, 'asset', $4, $5, $6, $7::jsonb)`,
        [randomUUID(), user.id, emoji === undefined ? "reaction.clear_all" : "reaction.clear_emoji", context.roomId, messageId, emoji ?? null, JSON.stringify({ removedEmojiCount: rows.rowCount })],
      );
      for (const row of rows.rows) {
        await this.emitUpdated(client, "asset", context.roomId, messageId, row.emoji, 0, "remove", user.id);
      }
    });
  }

  async assertCanViewRoom(scope: ReactionScope, roomId: string, userId: string): Promise<void> {
    if (scope === "asset") {
      const result = await this.database.pool.query<{
        is_public: boolean;
        can_read_roles: string[];
        role: string | null;
      }>(
        `SELECT asset.is_public, asset.can_read_roles, membership.role
         FROM assets.assets asset
         LEFT JOIN communities.memberships membership
           ON membership.community_id = asset.community_id AND membership.user_id = $2
         WHERE asset.id = $1`,
        [roomId, userId],
      );
      const room = result.rows[0];
      if (!room) throw new ApiException(404, "not_found", "Asset not found");
      const canRead = room.role
        ? room.can_read_roles.includes(room.role)
        : room.is_public && room.can_read_roles.includes("member");
      if (!canRead) throw new ApiException(403, "asset_forbidden", "You cannot read this asset");
      return;
    }

    const result = await this.database.pool.query<{ participant: boolean; blocked: boolean; participant_count: string }>(
      `SELECT
         EXISTS (SELECT 1 FROM dm.participants WHERE conversation_id = $1 AND user_id = $2) AS participant,
         (SELECT count(*)::text FROM dm.participants WHERE conversation_id = $1) AS participant_count,
         EXISTS (
           SELECT 1
           FROM dm.participants peer
           JOIN users.blocks block
             ON (block.blocker_id = $2 AND block.blocked_id = peer.user_id)
             OR (block.blocker_id = peer.user_id AND block.blocked_id = $2)
           WHERE peer.conversation_id = $1 AND peer.user_id <> $2
         ) AS blocked
       FROM dm.conversations conversation
       WHERE conversation.id = $1`,
      [roomId, userId],
    );
    if (!result.rows[0]) throw new ApiException(404, "not_found", "Conversation not found");
    if (!result.rows[0].participant || Number(result.rows[0].participant_count) !== 2 || result.rows[0].blocked) {
      throw new ApiException(403, "dm_blocked", "You can't message this user");
    }
  }

  async roomResync(scope: ReactionScope, roomId: string, userId: string) {
    const table = tables[scope];
    const roomColumn = scope === "asset" ? "asset_id" : "conversation_id";
    const result = await this.database.pool.query<{
      message_id: string;
      emoji: string;
      count: number;
      me: boolean;
    }>(
      `SELECT message.id AS message_id, counts.emoji, counts.count,
              EXISTS (SELECT 1 FROM ${table.reactions} mine
                      WHERE mine.message_id = message.id AND mine.emoji = counts.emoji AND mine.user_id = $2) AS me
       FROM ${table.messages} message
       JOIN ${table.counts} counts ON counts.message_id = message.id
       WHERE message.${roomColumn} = $1 AND message.deleted_at IS NULL
       ORDER BY message.created_at, message.id, counts.first_at`,
      [roomId, userId],
    );
    const byMessage = new Map<string, { emoji: string; count: number; me: boolean }[]>();
    for (const row of result.rows) {
      const reactions = byMessage.get(row.message_id) || [];
      reactions.push({ emoji: row.emoji, count: row.count, me: row.me });
      byMessage.set(row.message_id, reactions);
    }
    return {
      type: "reaction.resync" as const,
      scope,
      roomId,
      messages: [...byMessage].map(([messageId, reactions]) => ({ messageId, reactions })),
    };
  }

  private validateEmoji(emoji: string): void {
    if (!isAllowedReactionEmoji(emoji)) {
      throw new ApiException(400, "emoji_not_allowed", "Emoji must be a fully-qualified Unicode emoji");
    }
  }

  private async consumeWriteLimits(user: AuthenticatedUser): Promise<void> {
    await this.consumeLimit("reaction-write", user.id, user.trustLevel === 0 ? 20 : 60, 60_000);
    await this.consumeLimit("reaction-burst", user.id, 5, 3_000);
  }

  private async consumeLimit(family: string, userId: string, limit: number, windowMs: number): Promise<void> {
    const result = await this.rateLimiter.consume(family, userId, { limit, windowMs });
    if (!result.allowed) throw new ApiException(429, "rate_limited", "Too many reaction requests");
  }

  private decodeUsersCursor(value?: string) {
    try {
      const decoded = decodeCursor(value);
      if (decoded && decoded.score === undefined) throw new Error("Missing timestamp");
      return decoded;
    } catch {
      throw new ApiException(400, "validation_failed", "Invalid reaction users cursor", "cursor");
    }
  }

  private async assertAssetAccess(
    client: PoolClient,
    messageId: string,
    userId: string,
    access: "read" | "post" | "moderate",
    lock: boolean,
  ): Promise<MessageContext> {
    const result = await client.query<AssetMessageRow>(
      `SELECT message.asset_id, asset.community_id, message.deleted_at, asset.is_public,
              asset.can_read_roles, asset.can_post_roles, membership.role
       FROM chat.messages message
       JOIN assets.assets asset ON asset.id = message.asset_id
       LEFT JOIN communities.memberships membership
         ON membership.community_id = asset.community_id AND membership.user_id = $2
       WHERE message.id = $1
       ${lock ? "FOR UPDATE OF message" : ""}`,
      [messageId, userId],
    );
    const row = result.rows[0];
    if (!row || row.deleted_at) throw new ApiException(404, "not_found", "Message not found");
    const canRead = row.role
      ? row.can_read_roles.includes(row.role)
      : row.is_public && row.can_read_roles.includes("member");
    if (!canRead) throw new ApiException(403, "asset_forbidden", "You cannot read this asset");
    if (access === "post" && (!row.role || !row.can_post_roles.includes(row.role))) {
      throw new ApiException(403, "asset_forbidden", "You cannot react in this asset");
    }
    if (access === "moderate" && row.role !== "owner" && row.role !== "moderator") {
      throw new ApiException(403, "asset_forbidden", "Only moderators can clear reactions");
    }
    if (access === "post") {
      const restricted = await client.query(
        `SELECT 1 FROM communities.member_restrictions
         WHERE community_id = $1 AND user_id = $2
           AND (restriction = 'banned' OR expires_at > now())
         LIMIT 1`,
        [row.community_id, userId],
      );
      if (restricted.rowCount) throw new ApiException(403, "asset_forbidden", "You cannot react in this asset");
    }
    return { roomId: row.asset_id, deletedAt: row.deleted_at };
  }

  private async assertDmAccess(
    client: PoolClient,
    messageId: string,
    userId: string,
    lock: boolean,
  ): Promise<MessageContext> {
    const result = await client.query<{ conversation_id: string; deleted_at: Date | null }>(
      `SELECT message.conversation_id, message.deleted_at
       FROM dm.messages message
       WHERE message.id = $1
       ${lock ? "FOR UPDATE" : ""}`,
      [messageId],
    );
    const row = result.rows[0];
    if (!row || row.deleted_at) throw new ApiException(404, "not_found", "Message not found");
    const access = await client.query<{ participant: boolean; blocked: boolean; participant_count: string }>(
      `SELECT
         EXISTS (SELECT 1 FROM dm.participants WHERE conversation_id = $1 AND user_id = $2) AS participant,
         (SELECT count(*)::text FROM dm.participants WHERE conversation_id = $1) AS participant_count,
         EXISTS (
           SELECT 1
           FROM dm.participants peer
           JOIN users.blocks block
             ON (block.blocker_id = $2 AND block.blocked_id = peer.user_id)
             OR (block.blocker_id = peer.user_id AND block.blocked_id = $2)
           WHERE peer.conversation_id = $1 AND peer.user_id <> $2
         ) AS blocked`,
      [row.conversation_id, userId],
    );
    if (
      !access.rows[0]?.participant ||
      Number(access.rows[0]?.participant_count) !== 2 ||
      access.rows[0]?.blocked
    ) {
      throw new ApiException(403, "dm_blocked", "You can't message this user");
    }
    return { roomId: row.conversation_id, deletedAt: row.deleted_at };
  }

  private async emitToggle(
    client: PoolClient,
    scope: ReactionScope,
    roomId: string,
    messageId: string,
    emoji: string,
    count: number,
    op: "add" | "remove",
    userId: string,
    clientId?: string,
  ): Promise<void> {
    await this.emitUpdated(client, scope, roomId, messageId, emoji, count, op, userId, clientId);
    await insertOutboxEvent(client, {
      id: randomUUID(),
      type: "reaction.toggled",
      version: 1,
      timestamp: new Date().toISOString(),
      actor: userId,
      data: { scope, roomId, messageId, emoji, op, userId },
    });
  }

  private async emitUpdated(
    client: PoolClient,
    scope: ReactionScope,
    roomId: string,
    messageId: string,
    emoji: string,
    count: number,
    op: "add" | "remove",
    userId: string,
    clientId?: string,
  ): Promise<void> {
    const id = randomUUID();
    await insertOutboxEvent(client, {
      id,
      type: "reaction.updated",
      version: 1,
      timestamp: new Date().toISOString(),
      actor: userId,
      data: { scope, roomId, messageId, emoji, count, op, userId, ...(clientId ? { clientId } : {}) },
    });
    await client.query("SELECT pg_notify('kernel_reaction_outbox', $1)", [id]);
  }
}
