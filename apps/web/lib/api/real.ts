import type { ApiError } from "@square/shared";
import type { ApiClient, UploadSignRequest } from "./types";
import { ClientApiError } from "./errors";
import { appConfig } from "../config";
import { CSRF_HEADER, getCsrfToken } from "../csrf";

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
  createCommunity: (data) => req("/communities", { method: "POST", body: JSON.stringify(data) }),
  getCommunity: (id) => req(`/communities/${id}`),
  createChannel: (communityId, data) => req(`/communities/${communityId}/channels`, { method: "POST", body: JSON.stringify(data) }),
  getChannelTabs: (channelId) => req(`/channels/${channelId}/tabs`),
  createTab: (channelId, data) => req(`/channels/${channelId}/tabs`, { method: "POST", body: JSON.stringify(data) }),
  updateTabPermissions: (tabId, permissions) => req(`/tabs/${tabId}/permissions`, { method: "PATCH", body: JSON.stringify({ permissions }) }),
  listPosts: (tabId, opts) => req(`/tabs/${tabId}/posts${opts?.after ? `?after=${encodeURIComponent(opts.after)}` : opts?.cursor ? `?cursor=${encodeURIComponent(opts.cursor)}` : ""}`),
  createPost: (tabId, data) => req(`/tabs/${tabId}/posts`, { method: "POST", body: JSON.stringify(data) }),
  signUpload: (data: UploadSignRequest) => req("/uploads/sign", { method: "POST", body: JSON.stringify(data) }),

  // PROPOSED: not in backend doc
  listCommunities: (params) => req(`/communities${params?.filter ? `?filter=${encodeURIComponent(params.filter)}` : ""}`),
  // PROPOSED: not in backend doc
  listChannels: (communityId, params) => req(`/channels${communityId ? `?community=${encodeURIComponent(communityId)}` : ""}${params?.filter ? `${communityId ? "&" : "?"}filter=${encodeURIComponent(params.filter)}` : ""}`),
  // PROPOSED: not in backend doc
  joinChannel: (channelId) => req(`/channels/${channelId}/join`, { method: "POST" }),
  // PROPOSED: not in backend doc
  leaveChannel: (channelId) => req(`/channels/${channelId}/leave`, { method: "POST" }),
  // PROPOSED: not in backend doc
  myChannels: () => req(`/me/channels`),
  // PROPOSED: not in backend doc
  homeFeed: (opts) => req(`/me/feed${opts?.after ? `?after=${encodeURIComponent(opts.after)}` : ""}`),

  // PROPOSED: not in backend doc
  listProjects: (tabId) => req(`/tabs/${tabId}/projects`),
  // PROPOSED: not in backend doc
  getProject: (id) => req(`/projects/${id}`),
  // PROPOSED: not in backend doc
  createProject: (tabId, data) => req(`/tabs/${tabId}/projects`, { method: "POST", body: JSON.stringify(data) }),
  // PROPOSED: not in backend doc
  listCampaigns: (channelId) => req(`/channels/${channelId}/campaigns`),
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
  listConversations: () => req(`/me/conversations`),
  // PROPOSED: not in backend doc
  getOrCreateConversation: (username) => req(`/me/conversations`, { method: "POST", body: JSON.stringify({ username }) }),
  // PROPOSED: not in backend doc
  getConversation: (id) => req(`/me/conversations/${id}`),
  // PROPOSED: not in backend doc
  listMessages: (conversationId, opts) => req(`/me/conversations/${conversationId}/messages${opts?.after ? `?after=${encodeURIComponent(opts.after)}` : ""}`),
  // PROPOSED: not in backend doc
  sendMessage: (conversationId, text) => req(`/me/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  // PROPOSED: not in backend doc
  deleteMessage: (conversationId, messageId) => req(`/me/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" }),
  // PROPOSED: not in backend doc
  markRead: (conversationId) => req(`/me/conversations/${conversationId}/read`, { method: "POST" }),
  // PROPOSED: not in backend doc
  unreadCount: () => req(`/me/unread`),

  // PROPOSED: not in backend doc
  blockUser: (username) => req(`/me/blocks`, { method: "POST", body: JSON.stringify({ username }) }),
  // PROPOSED: not in backend doc
  unblockUser: (username) => req(`/me/blocks/${encodeURIComponent(username)}`, { method: "DELETE" }),
  // PROPOSED: not in backend doc
  listBlocked: () => req(`/me/blocks`),
  // PROPOSED: not in backend doc
  reportUser: (username, reason, note) => req(`/me/reports`, { method: "POST", body: JSON.stringify({ username, reason, note }) }),
};
