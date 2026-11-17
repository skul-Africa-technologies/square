import type { ApiClient, UploadSignRequest, UploadSignResponse } from "./types";
import { ClientApiError } from "./errors";
import { badges, blockedUsers as seedBlocked, campaigns, channels, communities, conversations as seedConversations, directMessages as seedDMs, posts as seedPosts, projects as seedProjects, reservedTaken, schools, tabs as seedTabs, users } from "./seed";
import type { BlockedUser, Campaign, Channel, Community, Conversation, DirectMessage, Post, Project, Tab, User } from "@square/shared";

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const posts: Post[] = [...seedPosts];
let tabs = [...seedTabs];
const projects = [...seedProjects];
let campaignState: Campaign[] = JSON.parse(JSON.stringify(campaigns)) as Campaign[];
const communitiesState = [...communities];
const channelsState: Channel[] = [...channels];
let currentUser: User = { ...users[0] };
let verifiedNew = false;
let conversationsState: Conversation[] = JSON.parse(JSON.stringify(seedConversations)) as Conversation[];
let dms: DirectMessage[] = JSON.parse(JSON.stringify(seedDMs)) as DirectMessage[];
let blocked: BlockedUser[] = [...seedBlocked];

function paginate<T>(items: T[], nextCursor: string | null = null) { return { items, nextCursor }; }
const joinedIds = new Set(channelsState.filter(c => c.joined).map(c => c.id));

function withJoinState(ch: Channel): Channel { return { ...ch, joined: joinedIds.has(ch.id) }; }
function channelById(id: string) { return channelsState.find(c => c.id === id || c.slug === id); }
function afterFilter<T extends { createdAt?: string; id: string }>(items: T[], after?: string): T[] {
  if (!after) return items;
  const [afterTime, afterId] = after.includes("|") ? after.split("|") : [after, ""];
  return items.filter(p => (p.createdAt || "") > afterTime || ((p.createdAt || "") === afterTime && p.id > afterId));
}

export const mockApi: ApiClient = {
  async requestCode() { await delay(); return { ok: true, retryAfter: 60 }; },
  async verifyCode(_email, code) {
    await delay();
    if (code === "000000") throw new ClientApiError({ code: "EXPIRED", message: "Code expired", field: "code" });
    if (code === "999999") throw new ClientApiError({ code: "CANCELLED", message: "Code cancelled after too many tries", field: "code" });
    if (!/^\d{6}$/.test(code)) throw new ClientApiError({ code: "INVALID", message: "Wrong code", field: "code" });
    const existing = code === "111111";
    verifiedNew = !existing;
    return existing ? { hasAccount: true } : { hasAccount: false };
  },
  async signup(data) {
    await delay();
    if (!verifiedNew) throw new ClientApiError({ code: "NO_TOKEN", message: "Verify email first" });
    currentUser = { id: "u-new", username: data.username, schoolId: data.schoolId, schoolName: schools.find(s => s.id === data.schoolId)?.name, verifiedStudent: true, joinedAt: new Date().toISOString(), badgeIds: ["verified"], skills: [] };
    return { token: "server-cookie" };
  },
  async usernameAvailable(username) { await delay(180); return { available: !reservedTaken.has(username.toLowerCase()) }; },
  async listSchools(query) { await delay(100); const q = (query || "").toLowerCase(); return schools.filter(s => s.name.toLowerCase().includes(q)); },
  async me() { await delay(100); return currentUser; },
  async updateMe(data) { await delay(120); currentUser = { ...currentUser, ...data }; return currentUser; },
  async createCommunity(data) { await delay(220); const c: Community = { id: `c_${Date.now()}`, slug: (data.name || "new").toLowerCase().replace(/\s+/g, "-"), name: data.name || "New community", blurb: data.blurb || "", memberCount: 1, category: data.category || "Web2", schoolName: data.schoolName || "FUT Minna", avatar: (data.name || "NC").slice(0, 2).toUpperCase() }; communitiesState.push(c); return c; },
  async getCommunity(id) { await delay(100); const c = communitiesState.find(x => x.id === id || x.slug === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" }); return c; },
  async createChannel(communityId, data) {
    await delay(180);
    const comm = communitiesState.find(c => c.id === communityId || c.slug === communityId);
    const ch: Channel = { id: `ch_${Date.now()}`, communityId: comm?.id || communityId, communityName: comm?.name, communitySlug: comm?.slug, name: data.name || "new-channel", slug: (data.name || "new-channel").toLowerCase().replace(/\s+/g, "-"), description: data.description, memberCount: 1, interest: comm?.category, isPublic: true, joined: true };
    channelsState.push(ch); joinedIds.add(ch.id);
    const base = { channelId: ch.id, enabled: true } as const;
    const t1: Tab = { id: `t_${Date.now()}_g`, ...base, name: "General", slug: "general", kind: "chat", fixed: "general", permissions: { canPost: ["owner", "moderator", "member"], canPin: ["owner", "moderator"], canRemove: ["owner", "moderator"] }, order: 0 };
    const t2: Tab = { id: `t_${Date.now()}_c`, ...base, name: "Community", slug: "community", kind: "feed", fixed: "community", permissions: { canPost: ["owner", "moderator", "member"], canPin: ["owner", "moderator"], canRemove: ["owner", "moderator"] }, order: 1 };
    tabs.push(t1, t2);
    return ch;
  },
  async getChannelTabs(channelId) { await delay(80); return tabs.filter(t => t.channelId === channelId).sort((a, b) => a.order - b.order); },
  async createTab(channelId, data) { await delay(120); const t: Tab = { id: `tab_${Date.now()}`, channelId, name: data.name || "Tab", slug: (data.name || "tab").toLowerCase().replace(/\s+/g, "-"), kind: data.kind || "chat", enabled: true, permissions: data.permissions || { canPost: ["owner", "moderator", "member"], canPin: ["owner", "moderator"], canRemove: ["owner", "moderator"] }, order: tabs.filter(x => x.channelId === channelId).length, template: data.template }; tabs.push(t); return t; },
  async updateTabPermissions(tabId, permissions) { await delay(100); tabs = tabs.map(t => t.id === tabId ? { ...t, permissions } : t); const t = tabs.find(x => x.id === tabId); if (!t) throw new ClientApiError({ code: "NOT_FOUND", message: "Tab not found" }); return t; },
  async listPosts(tabId, opts) {
    await delay(100);
    const items = afterFilter(posts.filter(p => p.tabId === tabId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)), opts?.after);
    return paginate(items);
  },
  async createPost(tabId, data) { await delay(120); const tab = tabs.find(t => t.id === tabId); const ch = tab ? channelById(tab.channelId) : undefined; const p: Post = { id: `p_${Date.now()}`, tabId, authorId: currentUser.id, content: data.content, createdAt: new Date().toISOString(), media: data.media, channelId: tab?.channelId, channelName: ch?.name, communitySlug: ch?.communitySlug, channelSlug: ch?.slug }; posts.push(p); return p; },
  async signUpload(_data: UploadSignRequest): Promise<UploadSignResponse> { void _data; await delay(120); return { signature: "mock", timestamp: Date.now(), cloudName: "demo", apiKey: "mock", folder: "square" }; },

  // PROPOSED: not in backend doc
  async listCommunities(params) {
    await delay(120);
    let items = [...communitiesState];
    const f = params?.filter;
    if (f && f !== "My school") items = items.filter(c => c.category.toLowerCase() === f.toLowerCase());
    if (f === "My school") items = items.filter(c => c.schoolName === currentUser.schoolName);
    return paginate(items);
  },
  // PROPOSED: not in backend doc
  async listChannels(communityId, params) {
    await delay(100);
    let items = channelsState.map(withJoinState);
    if (communityId) items = items.filter(c => c.communityId === communityId || c.communitySlug === communityId);
    if (params?.joined) items = items.filter(c => c.joined);
    const f = params?.filter;
    if (f && f !== "My school") items = items.filter(c => (c.interest || "").toLowerCase() === f.toLowerCase());
    if (f === "My school") items = items.filter(c => communitiesState.find(cm => cm.id === c.communityId)?.schoolName === currentUser.schoolName);
    return items;
  },
  // PROPOSED: not in backend doc
  async joinChannel(channelId) { await delay(120); const ch = channelsState.find(c => c.id === channelId || c.slug === channelId || c.communitySlug === channelId); if (ch) joinedIds.add(ch.id); return { ok: true }; },
  // PROPOSED: not in backend doc
  async leaveChannel(channelId) { await delay(120); joinedIds.delete(channelId); return { ok: true }; },
  // PROPOSED: not in backend doc
  async myChannels() { await delay(100); return channelsState.filter(c => joinedIds.has(c.id)).map(withJoinState); },
  // PROPOSED: not in backend doc
  async homeFeed(opts) {
    await delay(120);
    const joined = new Set(Array.from(joinedIds));
    const items = afterFilter(posts.filter(p => !p.channelId || joined.has(p.channelId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)), opts?.after);
    return paginate(items.slice(0, 30));
  },

  // PROPOSED: not in backend doc
  async listProjects(tabId) { await delay(100); return projects.filter(p => p.tabId === tabId); },
  // PROPOSED: not in backend doc
  async getProject(id) { await delay(80); const p = projects.find(x => x.id === id); if (!p) throw new ClientApiError({ code: "NOT_FOUND", message: "Project not found" }); return p; },
  // PROPOSED: not in backend doc
  async createProject(tabId, data) { await delay(150); const p: Project = { id: `pr_${Date.now()}`, channelId: "ch-general", tabId, title: data.title || "Untitled", status: (data.status as Project["status"]) || "idea", description: data.description || "", needs: data.needs || [], teamCount: 1, team: [{ id: currentUser.id, username: currentUser.username }], milestones: [], rolesNeeded: [], updates: [] }; projects.push(p); return p; },
  // PROPOSED: not in backend doc
  async listCampaigns(channelId) { await delay(100); return campaignState.filter((c) => c.channelId === channelId); },
  // PROPOSED: not in backend doc
  async getCampaign(id) { await delay(80); const c = campaignState.find((x) => x.id === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Campaign not found" }); return c; },
  // PROPOSED: not in backend doc
  async joinCampaign(id) { await delay(120); campaignState = campaignState.map((c) => c.id === id ? { ...c, joined: c.joined + 1 } : c); const c = campaignState.find((x) => x.id === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Campaign not found" }); return c; },
  // PROPOSED: not in backend doc
  async completeCampaignTask(campaignId, taskId) { await delay(120); campaignState = campaignState.map((c) => c.id === campaignId ? { ...c, tasks: c.tasks.map((t) => t.id === taskId ? { ...t, done: true } : t) } : c); const c = campaignState.find((x) => x.id === campaignId); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Campaign not found" }); return c; },
  // PROPOSED: not in backend doc
  async listBadges() { await delay(60); return badges; },
  // PROPOSED: not in backend doc
  async getProfile(username) {
    await delay(100);
    const u = users.find(x => x.username === username) || (currentUser.username === username ? currentUser : null);
    if (!u) throw new ClientApiError({ code: "NOT_FOUND", message: "User not found" });
    const b = badges.filter(x => u.badgeIds?.includes(x.id));
    const userProjects = projects.filter(p => p.team.some(t => t.username === username));
    const joinedChannels = channelsState.filter(c => joinedIds.has(c.id)).map(withJoinState);
    return { ...u, projects: userProjects, campaigns: campaignState, badges: b, channelsJoined: joinedChannels.length, joinedChannels };
  },

  // PROPOSED: not in backend doc
  async listConversations() { await delay(100); return conversationsState.map(c => ({ ...c })); },
  // PROPOSED: not in backend doc
  async getOrCreateConversation(username) {
    await delay(120);
    const existing = conversationsState.find(c => c.participant.username === username);
    if (existing) return existing;
    const u = users.find(x => x.username === username) || { id: username, username };
    const conv: Conversation = { id: `dm_${Date.now()}`, participant: { id: u.id, username: u.username }, unreadCount: 0, blocked: blocked.some(b => b.username === username) };
    conversationsState = [conv, ...conversationsState];
    return conv;
  },
  // PROPOSED: not in backend doc
  async getConversation(id) { await delay(80); const c = conversationsState.find(x => x.id === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Conversation not found" }); return c; },
  // PROPOSED: not in backend doc
  async listMessages(conversationId, opts) { await delay(100); const items = afterFilter(dms.filter(m => m.conversationId === conversationId && !m.deleted).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)), opts?.after); return paginate(items); },
  // PROPOSED: not in backend doc
  async sendMessage(conversationId, text) {
    await delay(120);
    const conv = conversationsState.find(c => c.id === conversationId);
    if (conv?.blocked) throw new ClientApiError({ code: "BLOCKED", message: "Blocked" });
    const m: DirectMessage = { id: `m_${Date.now()}`, conversationId, senderId: currentUser.id, text, createdAt: new Date().toISOString(), status: "sent" };
    dms.push(m);
    conversationsState = conversationsState.map(c => c.id === conversationId ? { ...c, lastMessage: text, lastMessageAt: m.createdAt } : c);
    return m;
  },
  // PROPOSED: not in backend doc
  async deleteMessage(conversationId, messageId) { await delay(80); dms = dms.map(m => m.id === messageId && m.conversationId === conversationId ? { ...m, deleted: true, text: "" } : m); return { ok: true }; },
  // PROPOSED: not in backend doc
  async markRead(conversationId) { await delay(60); conversationsState = conversationsState.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c); dms = dms.map(m => m.conversationId === conversationId && m.senderId !== currentUser.id ? { ...m, status: "seen" } : m); return { ok: true }; },
  // PROPOSED: not in backend doc
  async unreadCount() { await delay(50); return { count: conversationsState.reduce((a, c) => a + c.unreadCount, 0) }; },

  // PROPOSED: not in backend doc
  async blockUser(username) { await delay(100); if (!blocked.some(b => b.username === username)) blocked.push({ id: username, username }); conversationsState = conversationsState.map(c => c.participant.username === username ? { ...c, blocked: true } : c); return { ok: true }; },
  // PROPOSED: not in backend doc
  async unblockUser(username) { await delay(100); blocked = blocked.filter(b => b.username !== username); conversationsState = conversationsState.map(c => c.participant.username === username ? { ...c, blocked: false } : c); return { ok: true }; },
  // PROPOSED: not in backend doc
  async listBlocked() { await delay(80); return blocked; },
  // PROPOSED: not in backend doc
  async reportUser() { await delay(120); return { ok: true }; },
};

// Mock SSE helpers: simulate incoming DM occasionally
export function mockStreamController(onEvent: (e: { type: string; data: unknown }) => void) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    const conv = conversationsState.find(c => c.id === "dm1");
    if (conv && Math.random() < 0.2) {
      const m: DirectMessage = { id: `m_stream_${Date.now()}`, conversationId: "dm1", senderId: "u2", text: "Ping from stream", createdAt: new Date().toISOString(), status: "sent" };
      dms.push(m);
      conv.lastMessage = m.text; conv.lastMessageAt = m.createdAt; if (conv.unreadCount === 0) conv.unreadCount = 1;
      onEvent({ type: "dm", data: { conversationId: "dm1", message: m, unread: conversationsState.reduce((a,c)=>a+c.unreadCount,0) } });
    }
    t = setTimeout(tick, 15000);
  };
  t = setTimeout(tick, 12000);
  return () => { if (t) clearTimeout(t); };
}
