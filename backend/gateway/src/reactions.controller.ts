import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Param,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService } from "@square/kernel";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  reactionMessageIdParamsSchema,
  reactionMessageParamsSchema,
  reactionResyncEventSchema,
  reactionRoomParamsSchema,
  reactionScopeSchema,
  reactionUpdatedEventSchema,
  reactionUsersPageSchema,
  reactionUsersQuerySchema,
} from "@square/shared";
import { ReactionsService } from "./reactions.service";

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

function authenticatedUser(request: FastifyRequest): AuthenticatedUser {
  const user = (request as RequestWithUser).user;
  if (!user) throw new ApiException(401, "unauthenticated", "Sign in to continue");
  return user;
}

@Controller()
@ApiTags("message reactions")
export class ReactionsController {
  private readonly logger = new Logger(ReactionsController.name);

  constructor(
    private readonly reactions: ReactionsService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  @Put("messages/:id/reactions/:emoji")
  @HttpCode(204)
  @ApiOperation({ summary: "Add the current user's reaction to an asset message" })
  @ApiResponse({ status: 204, description: "Reaction added or already present" })
  async addAssetReaction(
    @Param("id") messageId: string,
    @Param("emoji") emoji: string,
    @Headers("idempotency-key") clientId: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const params = reactionMessageParamsSchema.parse({ messageId, emoji });
    await this.reactions.toggle("asset", params.messageId, params.emoji, authenticatedUser(request), true, clientId);
  }

  @Delete("messages/:id/reactions/:emoji/me")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove the current user's reaction from an asset message" })
  @ApiResponse({ status: 204, description: "Reaction removed or already absent" })
  async removeAssetReaction(
    @Param("id") messageId: string,
    @Param("emoji") emoji: string,
    @Headers("idempotency-key") clientId: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const params = reactionMessageParamsSchema.parse({ messageId, emoji });
    await this.reactions.toggle("asset", params.messageId, params.emoji, authenticatedUser(request), false, clientId);
  }

  @Get("messages/:id/reactions/:emoji/users")
  @ApiOperation({ summary: "List users who reacted to an asset message" })
  async assetReactionUsers(
    @Param("id") messageId: string,
    @Param("emoji") emoji: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    const params = reactionMessageParamsSchema.parse({ messageId, emoji });
    const query = reactionUsersQuerySchema.parse({ cursor });
    return reactionUsersPageSchema.parse(
      await this.reactions.listUsers("asset", params.messageId, params.emoji, authenticatedUser(request), query.cursor),
    );
  }

  @Delete("messages/:id/reactions/:emoji")
  @HttpCode(204)
  @ApiOperation({ summary: "Clear one reaction from an asset message (moderators)" })
  async clearAssetEmoji(
    @Param("id") messageId: string,
    @Param("emoji") emoji: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const params = reactionMessageParamsSchema.parse({ messageId, emoji });
    await this.reactions.clearAssetMessage(params.messageId, authenticatedUser(request), params.emoji);
  }

  @Delete("messages/:id/reactions")
  @HttpCode(204)
  @ApiOperation({ summary: "Clear all reactions from an asset message (moderators)" })
  async clearAssetReactions(
    @Param("id") messageId: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const params = reactionMessageIdParamsSchema.parse({ messageId });
    await this.reactions.clearAssetMessage(params.messageId, authenticatedUser(request));
  }

  @Put("dm/messages/:id/reactions/:emoji")
  @HttpCode(204)
  @ApiOperation({ summary: "Add the current user's reaction to a direct message" })
  async addDmReaction(
    @Param("id") messageId: string,
    @Param("emoji") emoji: string,
    @Headers("idempotency-key") clientId: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const params = reactionMessageParamsSchema.parse({ messageId, emoji });
    await this.reactions.toggle("dm", params.messageId, params.emoji, authenticatedUser(request), true, clientId);
  }

  @Delete("dm/messages/:id/reactions/:emoji/me")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove the current user's reaction from a direct message" })
  async removeDmReaction(
    @Param("id") messageId: string,
    @Param("emoji") emoji: string,
    @Headers("idempotency-key") clientId: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const params = reactionMessageParamsSchema.parse({ messageId, emoji });
    await this.reactions.toggle("dm", params.messageId, params.emoji, authenticatedUser(request), false, clientId);
  }

  @Get("dm/messages/:id/reactions/:emoji/users")
  @ApiOperation({ summary: "List users who reacted to a direct message" })
  async dmReactionUsers(
    @Param("id") messageId: string,
    @Param("emoji") emoji: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    const params = reactionMessageParamsSchema.parse({ messageId, emoji });
    const query = reactionUsersQuerySchema.parse({ cursor });
    return reactionUsersPageSchema.parse(
      await this.reactions.listUsers("dm", params.messageId, params.emoji, authenticatedUser(request), query.cursor),
    );
  }

  @Get("reactions/stream")
  @ApiOperation({ summary: "Stream reaction updates for a room" })
  @ApiResponse({ status: 200, description: "Server-sent reaction updates and initial resync" })
  async streamRoomReactions(
    @Query("scope") scopeValue: string,
    @Query("roomId") roomId: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const user = authenticatedUser(request);
    if (scopeValue !== "asset" && scopeValue !== "dm") {
      throw new ApiException(400, "validation_failed", "Invalid reaction room scope", "scope");
    }
    const scope = reactionScopeSchema.parse(scopeValue);
    const { roomId: validatedRoomId } = reactionRoomParamsSchema.parse({ roomId });
    roomId = validatedRoomId;
    await this.reactions.assertCanViewRoom(scope, roomId, user.id);
    const client = await this.database.pool.connect();
    let closed = false;
    let ready = false;
    let backedUp = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const pendingIds: string[] = [];
    const MAX_PENDING = 200;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      client.removeListener("notification", onNotification);
      void client.query("UNLISTEN kernel_reaction_outbox").finally(() => client.release());
    };
    const writeEvent = (name: string, id: string, data: unknown) => {
      if (closed || backedUp || reply.raw.destroyed) return;
      backedUp = !reply.raw.write(`id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const deliver = async (eventId: string) => {
      if (closed) return;
      try {
        const result = await this.database.pool.query<{ id: string; type: string; payload: { data?: Record<string, unknown> } }>(
          "SELECT id, type, payload FROM kernel.outbox WHERE id = $1",
          [eventId],
        );
        const row = result.rows[0];
        const data = row?.payload?.data;
        if (row?.type !== "reaction.updated" || data?.scope !== scope || data?.roomId !== roomId) return;
        await this.reactions.assertCanViewRoom(scope, roomId, user.id);
        const event = reactionUpdatedEventSchema.parse({ ...data, type: "reaction.updated" });
        writeEvent(event.type, row.id, event);
      } catch {
        this.logger.warn("Closing reaction stream after an event delivery failure");
        reply.raw.end();
        cleanup();
      }
    };
    const onNotification = (notification: { channel?: string; payload?: string }) => {
      if (notification.channel !== "kernel_reaction_outbox" || !notification.payload || closed) return;
      if (!ready) {
        if (pendingIds.length < MAX_PENDING) pendingIds.push(notification.payload);
        return;
      }
      void deliver(notification.payload);
    };

    try {
      await client.query("LISTEN kernel_reaction_outbox");
      client.on("notification", onNotification);
      await this.reactions.assertCanViewRoom(scope, roomId, user.id);
      const resync = reactionResyncEventSchema.parse(await this.reactions.roomResync(scope, roomId, user.id));
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.flushHeaders();
      reply.raw.on("drain", () => { backedUp = false; });
      writeEvent(resync.type, `resync-${Date.now()}`, resync);
      ready = true;
      for (const eventId of pendingIds.splice(0)) void deliver(eventId);
      heartbeat = setInterval(() => { if (!closed && !backedUp && !reply.raw.destroyed) reply.raw.write(": keep-alive\n\n"); }, 20_000);
      reply.raw.on("close", cleanup);
    } catch (error) {
      client.removeListener("notification", onNotification);
      client.release();
      throw error;
    }
  }
}
