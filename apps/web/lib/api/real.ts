import type { ApiClient, UploadSignRequest } from "./types";
import { ClientApiError } from "./errors";
import { appConfig } from "../config";
import { CSRF_HEADER, getCsrfToken } from "../csrf";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string> || {}) };
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers[CSRF_HEADER] = csrf;
  }
  const res = await fetch(`${appConfig.apiUrl}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClientApiError(data as any);
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
  listChannels: (communityId) => req(`/communities/${communityId}/channels`),
  listProjects: (tabId) => req(`/tabs/${tabId}/projects`),
  getProject: (id) => req(`/projects/${id}`),
  createProject: (tabId, data) => req(`/tabs/${tabId}/projects`, { method: "POST", body: JSON.stringify(data) }),
  listCampaigns: (channelId) => req(`/channels/${channelId}/campaigns`),
  getCampaign: (id) => req(`/campaigns/${id}`),
  joinCampaign: (id) => req(`/campaigns/${id}/join`, { method: "POST" }),
  completeCampaignTask: (campaignId, taskId) => req(`/campaigns/${campaignId}/tasks/${taskId}/complete`, { method: "POST" }),
  listBadges: () => req(`/badges`),
  getProfile: (username) => req(`/u/${encodeURIComponent(username)}`),
};
