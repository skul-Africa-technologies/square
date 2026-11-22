import type { ApiError, MentionScope, ReactionScope } from "@square/shared";
import type { ApiClient, UploadSignRequest } from "./types";
import { ClientApiError } from "./errors";
import { appConfig } from "../config";
import { CSRF_HEADER, getCsrfToken } from "../csrf";
import {
  apiOkResponseSchema,
  mentionRecordSchema,
  mentionScopeSchema,
  mentionSeenRequestSchema,
  mentionableMembersPageSchema,
  mentionableQuerySchema,
  reactionPathSchema,
  reactionRequestSchema,
  reactionStreamEventSchema,
  reactionUsersPageSchema,
  reactionUsersQuerySchema,
  unreadSummarySchema,
} from "@square/shared";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers.set(CSRF_HEADER, csrf);
  }
  const res = await fetch(`${appConfig.apiUrl}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const err = (data && typeof data === "object" ? data : { code: "ERROR", message: "Request failed" }) as ApiError;
    throw new ClientApiError(err);
  }
  return data as T;
}

export const realApi: ApiClient = {
  requestCode: (email) => req("/auth/request-code", { method: "POST", body: JSON.stringify({ email }) }),
  verifyCode: (email, code) => req("/auth/verify-code", { method: "POST", body: JSON.stringify({ email, code }) }),
  signup: (data) => req("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
  usernameAvailable: (username) => req(`/users/username-available?username=${encodeURIComponent(username)}`),
  listSchools: (query) => req(`/schools${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  me: () => req("/me"),
  updateMe: (data) => req("/me", { method: "PATCH", body: JSON.stringify(data) }),

  // PROPOSED: not in backend doc
  createCommunity: (data) => req("/communities", { method: "POST", body: JSON.stringify(data) }),
  // PROPOSED: not in backend doc
  getCommunity: (id) => req(`/communities/${id}`),
  // PROPOSED: not in backend doc
  joinCommunity: (id) => req(`/communities/${id}/join`, { method: "POST" }),
  // PROPOSED: not in backend doc
  leaveCommunity: (id) => req(`/communities/${id}/join`, { method: "DELETE" }),
  // PROPOSED: not in backend doc
  listCommunityMembers: (id) => req(`/communities/${id}/members`),
  // PROPOSED: not in backend doc
  myCommunities: () => req(`/me/communities`),
  // PROPOSED: not in backend doc
  exploreCommunities: (params) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.category) qs.set("category", params.category);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.school) qs.set("school", params.school);
    const q = qs.toString();
    return req(`/explore/communities${q ? `?${q}` : ""}`);
  },

  // PROPOSED: not in backend doc
  getAssetCatalog: () => req(`/asset-catalog`),
  // PROPOSED: not in backend doc
  listCommunityAssets: (slug) => req(`/communities/${encodeURIComponent(slug)}/assets`),
  // PROPOSED: not in backend doc
  addAsset: (communitySlug, catalogKey) => req(`/communities/${encodeURIComponent(communitySlug)}/assets`, { method: "POST", body: JSON.stringify({ catalogKey }) }),
  // PROPOSED: not in backend doc
  reorderCommunityAssets: (slug, assetIds) => req(`/communities/${encodeURIComponent(slug)}/assets/order`, { method: "PUT", body: JSON.stringify({ assetIds }) }),
  // PROPOSED: not in backend doc
  deleteAsset: (assetId) => req(`/assets/${assetId}`, { method: "DELETE" }),
  // PROPOSED: not in backend doc
  updateAssetPermissions: (assetId, permissions) => req(`/assets/${assetId}/permissions`, { method: "PATCH", body: JSON.stringify({ permissions }) }),
  // PROPOSED: not in backend doc
  markAssetRead: (assetId) => req(`/assets/${assetId}/read`, { method: "POST" }),

  // PROPOSED: not in backend doc
  listPosts: (assetId, opts) => req(`/assets/${assetId}/posts${opts?.after ? `?after=${encodeURIComponent(opts.after)}` : opts?.cursor ? `?cursor=${encodeURIComponent(opts.cursor)}` : ""}`),
  // PROPOSED: not in backend doc (reply fields)
  createPost: (assetId, data) => req(`/assets/${assetId}/posts`, { method: "POST", body: JSON.stringify(data) }),
  // PROPOSED: not in backend doc
  listItems: (assetId) => req(`/assets/${assetId}/items`),
  // PROPOSED: not in backend doc
  createItem: (assetId, data) => req(`/assets/${assetId}/items`, { method: "POST", body: JSON.stringify(data) }),
  // PROPOSED: not in backend doc
  deleteItem: (assetId, itemId) => req(`/assets/${assetId}/items/${itemId}`, { method: "DELETE" }),
  signUpload: (data: UploadSignRequest) => req("/uploads/sign", { method: "POST", body: JSON.stringify(data) }),

  // PROPOSED: not in backend doc
  homeFeed: (opts) => req(`/me/feed${opts?.after ? `?after=${encodeURIComponent(opts.after)}` : ""}`),

  // PROPOSED: not in backend doc
  listProjects: (assetId) => req(`/assets/${assetId}/projects`),
  // PROPOSED: not in backend doc
  getProject: (id) => req(`/projects/${id}`),
  // PROPOSED: not in backend doc
  createProject: (assetId, data) => req(`/assets/${assetId}/projects`, { method: "POST", body: JSON.stringify(data) }),
  // PROPOSED: not in backend doc
  listCampaigns: (assetId) => req(`/assets/${assetId}/campaigns`),
  // PROPOSED: not in backend doc
  getCampaign: (id) => req(`/campaigns/${id}`),
  // PROPOSED: not in backend doc
  joinCampaign: (id) => req(`/campaigns/${id}/join`, { method: "POST" }),
  // PROPOSED: not in backend doc
  completeCampaignTask: (campaignId, taskId) => req(`/campaigns/${campaignId}/tasks/${taskId}/complete`, { method: "POST" }),
  // PROPOSED: not in backend doc
  listBadges: () => req(`/badges`),
  // PROPOSED: not in backend doc
  getProfile: (username) => req(`/u/${encodeURIComponent(username)}`),
  // PROPOSED: not in backend doc
  getProfileProjects: (username) => req(`/u/${encodeURIComponent(username)}/projects`),
  // PROPOSED: not in backend doc
  getProfileActivity: (username) => req(`/u/${encodeURIComponent(username)}/activity`),
  // PROPOSED: not in backend doc
  getProfileBadges: (username) => req(`/u/${encodeURIComponent(username)}/badges`),
  // PROPOSED: not in backend doc
  sharedCommunities: (username) => req(`/u/${encodeURIComponent(username)}/shared-communities`),

  // PROPOSED: not in backend doc
  listConversations: () => req(`/me/conversations`),
  // PROPOSED: not in backend doc
  getOrCreateConversation: (username) => req(`/me/conversations`, { method: "POST", body: JSON.stringify({ username }) }),
  // PROPOSED: not in backend doc
  getConversation: (id) => req(`/me/conversations/${id}`),
  // PROPOSED: not in backend doc
  listMessages: (conversationId, opts) => req(`/me/conversations/${conversationId}/messages${opts?.after ? `?after=${encodeURIComponent(opts.after)}` : ""}`),
  // PROPOSED: not in backend doc (reply fields)
  sendMessage: (conversationId, text, opts) => req(`/me/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text, ...opts }) }),
  // PROPOSED: not in backend doc
  deleteMessage: (conversationId, messageId) => req(`/me/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" }),
  // PROPOSED: not in backend doc
  setMessageReaction: async (scope: ReactionScope, roomId: string, messageId: string, emoji: string, add: boolean, clientId: string) => {
    const request = reactionRequestSchema.parse({ scope, roomId, messageId, emoji, add, clientId });
    const root = request.scope === "dm" ? "/dm/messages" : "/messages";
    await req(`${root}/${encodeURIComponent(request.messageId)}/reactions/${encodeURIComponent(request.emoji)}${request.add ? "" : "/me"}`, {
      method: request.add ? "PUT" : "DELETE",
      headers: { "Idempotency-Key": request.clientId },
    });
    return apiOkResponseSchema.parse({ ok: true });
  },
  // PROPOSED: not in backend doc
  listReactionUsers: async (scope, roomId, messageId, emoji, cursor) => {
    const request = reactionPathSchema.parse({ scope, roomId, messageId, emoji });
    const query = reactionUsersQuerySchema.parse({ cursor });
    const root = request.scope === "dm" ? "/dm/messages" : "/messages";
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    const response: unknown = await req(`${root}/${encodeURIComponent(request.messageId)}/reactions/${encodeURIComponent(request.emoji)}/users${params.size ? `?${params}` : ""}`);
    return reactionUsersPageSchema.parse(response);
  },
  // PROPOSED: not in backend doc
  subscribeReactionEvents: (scope, roomId, listener) => {
    const params = new URLSearchParams({ scope, roomId });
    const source = new EventSource(`${appConfig.apiUrl}/reactions/stream?${params}`, { withCredentials: true });
    const onReaction = (message: MessageEvent<string>) => {
      try {
        const event: unknown = JSON.parse(message.data);
        listener(reactionStreamEventSchema.parse(event));
      } catch (error) {
        console.error("Could not parse reaction.updated event", error);
      }
    };
    source.addEventListener("reaction.updated", onReaction as EventListener);
    source.addEventListener("reaction.resync", onReaction as EventListener);
    return () => source.close();
  },
  // PROPOSED: not in backend doc
  listMentions: async (scope: MentionScope, roomId: string) => {
    const validScope = mentionScopeSchema.parse(scope);
    const root = validScope === "dm" ? `/dm/conversations/${encodeURIComponent(roomId)}` : `/assets/${encodeURIComponent(roomId)}`;
    const response: unknown = await req(`${root}/mentions?unread=true`);
    return mentionRecordSchema.array().parse(response);
  },
  // PROPOSED: not in backend doc
  markMentionsSeen: async (scope: MentionScope, roomId: string, data, options) => {
    const validScope = mentionScopeSchema.parse(scope);
    const request = mentionSeenRequestSchema.parse(data);
    const root = validScope === "dm" ? `/dm/conversations/${encodeURIComponent(roomId)}` : `/assets/${encodeURIComponent(roomId)}`;
    const response: unknown = await req(`${root}/mentions/seen`, { method: "POST", body: JSON.stringify(request), keepalive: options?.keepalive });
    return apiOkResponseSchema.parse(response);
  },
  // PROPOSED: not in backend doc
  mentionableMembers: async (scope: MentionScope, roomId: string, params) => {
    const validScope = mentionScopeSchema.parse(scope);
    const query = mentionableQuerySchema.parse(params || {});
    const root = validScope === "dm" ? `/dm/conversations/${encodeURIComponent(roomId)}` : `/assets/${encodeURIComponent(roomId)}`;
    const searchParams = new URLSearchParams();
    if (query.q) searchParams.set("q", query.q);
    if (query.cursor) searchParams.set("cursor", query.cursor);
    if (query.limit) searchParams.set("limit", String(query.limit));
    const response: unknown = await req(`${root}/mentionable${searchParams.size ? `?${searchParams}` : ""}`);
    return mentionableMembersPageSchema.parse(response);
  },
  // PROPOSED: not in backend doc
  markRead: (conversationId) => req(`/me/conversations/${conversationId}/read`, { method: "POST" }),
  // PROPOSED: not in backend doc
  unreadCount: async () => {
    const rawSummary: unknown = await req("/me/unread");
    const summary = unreadSummarySchema.parse(rawSummary);
    return {
      unread: summary.dm.unread + summary.assets.reduce((total, asset) => total + asset.unread, 0),
      mentions: summary.dm.mentions + summary.assets.reduce((total, asset) => total + asset.mentions, 0),
    };
  },

  // PROPOSED: not in backend doc
  blockUser: (username) => req(`/me/blocks`, { method: "POST", body: JSON.stringify({ username }) }),
  // PROPOSED: not in backend doc
  unblockUser: (username) => req(`/me/blocks/${encodeURIComponent(username)}`, { method: "DELETE" }),
  // PROPOSED: not in backend doc
  listBlocked: () => req(`/me/blocks`),
  // PROPOSED: not in backend doc
  reportUser: (username, reason, note) => req(`/me/reports`, { method: "POST", body: JSON.stringify({ username, reason, note }) }),

  // PROPOSED: not in backend doc
  search: (q) => req(`/search?q=${encodeURIComponent(q)}`),
  searchSuggested: () => req(`/search/suggested`),
  // PROPOSED: not in backend doc
  getPresence: (ids) => req(`/presence?ids=${encodeURIComponent(ids.join(","))}`),
  // PROPOSED: not in backend doc
  setPresence: (mode) => req(`/me/presence`, { method: "PATCH", body: JSON.stringify({ mode }) }),
  // PROPOSED: not in backend doc
  recentDms: (limit = 6) => req(`/dms/recent?limit=${limit}`),
  // PROPOSED: not in backend doc
  setConversationMuted: (conversationId, muted) => req(`/me/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ muted }) }),
  // PROPOSED: not in backend doc
  hideConversation: (conversationId) => req(`/me/conversations/${conversationId}`, { method: "DELETE" }),

  // PROPOSED: not in backend doc
  discover: () => req("/discover"),
  // PROPOSED: not in backend doc
  dismissPerson: (id) => req(`/discover/people/${id}/dismiss`, { method: "POST" }),
  // PROPOSED: not in backend doc
  updatePrivacy: (data) => req("/me/privacy", { method: "PATCH", body: JSON.stringify(data) }),
};
