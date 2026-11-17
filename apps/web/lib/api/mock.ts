import type { ApiClient, UploadSignRequest, UploadSignResponse } from "./types";
import { ClientApiError } from "./errors";
import { badges, campaigns, channels, communities, posts as seedPosts, projects as seedProjects, reservedTaken, schools, tabs as seedTabs, users } from "./seed";
import type { Community, Post, Project, Tab, User } from "@square/shared";

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
let posts = [...seedPosts];
let tabs = [...seedTabs];
let projects = [...seedProjects];
let campaignState = JSON.parse(JSON.stringify(campaigns));
let communitiesState = [...communities];
let channelsState = [...channels];
let currentUser: User = { ...users[0] };
let verifiedNew = false;

function paginate<T>(items: T[], nextCursor: string | null = null) { return { items, nextCursor }; }

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
  async usernameAvailable(username) { await delay(200); return { available: !reservedTaken.has(username.toLowerCase()) }; },
  async listSchools(query) { await delay(120); const q = (query || "").toLowerCase(); return schools.filter(s => s.name.toLowerCase().includes(q)); },
  async me() { await delay(120); return currentUser; },
  async updateMe(data) { await delay(150); currentUser = { ...currentUser, ...data }; return currentUser; },
  async createCommunity(data) { await delay(250); const c: Community = { id: `c_${Date.now()}`, slug: (data.name || "new").toLowerCase().replace(/\s+/g, "-"), name: data.name || "New community", blurb: data.blurb || "", memberCount: 1, category: data.category || "Web2", schoolName: data.schoolName || "FUT Minna", avatar: (data.name || "NC").slice(0, 2).toUpperCase() }; communitiesState = [c, ...communitiesState]; return c; },
  async getCommunity(id) { await delay(120); const c = communitiesState.find(x => x.id === id || x.slug === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" }); return c; },
  async createChannel(communityId, data) { await delay(200); const ch = { id: `ch_${Date.now()}`, communityId, name: data.name || "new-channel", slug: (data.name || "new-channel").toLowerCase().replace(/\s+/g, "-"), description: data.description }; channelsState.push(ch as any); const base = { channelId: ch.id, enabled: true }; tabs.push({ id: `t_${Date.now()}_g`, ...base, name: "General", slug: "general", kind: "chat", fixed: "general", permissions: { canPost: ["owner", "moderator", "member"], canPin: ["owner", "moderator"], canRemove: ["owner", "moderator"] }, order: 0 } as Tab); tabs.push({ id: `t_${Date.now()}_c`, ...base, name: "Community", slug: "community", kind: "feed", fixed: "community", permissions: { canPost: ["owner", "moderator", "member"], canPin: ["owner", "moderator"], canRemove: ["owner", "moderator"] }, order: 1 } as Tab); return ch as any; },
  async getChannelTabs(channelId) { await delay(100); return tabs.filter(t => t.channelId === channelId).sort((a, b) => a.order - b.order); },
  async createTab(channelId, data) { await delay(150); const t: Tab = { id: `tab_${Date.now()}`, channelId, name: data.name || "Tab", slug: (data.name || "tab").toLowerCase().replace(/\s+/g, "-"), kind: data.kind || "chat", enabled: true, permissions: data.permissions || { canPost: ["owner", "moderator", "member"], canPin: ["owner", "moderator"], canRemove: ["owner", "moderator"] }, order: tabs.filter(x => x.channelId === channelId).length, template: data.template }; tabs.push(t); return t; },
  async updateTabPermissions(tabId, permissions) { await delay(120); tabs = tabs.map(t => t.id === tabId ? { ...t, permissions } : t); const t = tabs.find(x => x.id === tabId); if (!t) throw new ClientApiError({ code: "NOT_FOUND", message: "Tab not found" }); return t; },
  async listPosts(tabId, opts) {
    await delay(120);
    let items = posts.filter(p => p.tabId === tabId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    if (opts?.after) {
      const [afterTime, afterId] = opts.after.includes("|") ? opts.after.split("|") : [opts.after, ""];
      items = items.filter(p => p.createdAt > afterTime || (p.createdAt === afterTime && p.id > afterId));
    }
    return paginate(items);
  },
  async createPost(tabId, data) { await delay(150); const p: Post = { id: `p_${Date.now()}`, tabId, authorId: currentUser.id, content: data.content, createdAt: new Date().toISOString(), media: data.media }; posts.push(p); return p; },
  async signUpload(_data: UploadSignRequest): Promise<UploadSignResponse> { await delay(150); return { signature: "mock", timestamp: Date.now(), cloudName: "demo", apiKey: "mock", folder: "square" }; },
  // PROPOSED
  async listCommunities(params) { await delay(150); let items = [...communitiesState]; const f = params?.filter; if (f && f !== "My school") items = items.filter(c => c.category.toLowerCase() === f.toLowerCase()); if (f === "My school") items = items.filter(c => c.schoolName === currentUser.schoolName); return paginate(items); },
  async listChannels(communityId) { await delay(100); return channelsState.filter(c => c.communityId === communityId || (communityId === "web3-club" && c.communityId === "wc")); },
  async listProjects(tabId) { await delay(120); return projects.filter(p => p.tabId === tabId); },
  async getProject(id) { await delay(100); const p = projects.find(x => x.id === id); if (!p) throw new ClientApiError({ code: "NOT_FOUND", message: "Project not found" }); return p; },
  async createProject(tabId, data) { await delay(150); const p: Project = { id: `pr_${Date.now()}`, channelId: "ch-general", tabId, title: data.title || "Untitled", status: (data.status as Project["status"]) || "idea", description: data.description || "", needs: data.needs || [], teamCount: 1, team: [{ id: currentUser.id, username: currentUser.username }], milestones: [], rolesNeeded: [], updates: [] }; projects.push(p); return p; },
  async listCampaigns(channelId) { await delay(120); return campaignState.filter((c: any) => c.channelId === channelId); },
  async getCampaign(id) { await delay(100); const c = campaignState.find((x: any) => x.id === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Campaign not found" }); return c; },
  async joinCampaign(id) { await delay(150); campaignState = campaignState.map((c: any) => c.id === id ? { ...c, joined: c.joined + 1 } : c); return campaignState.find((c: any) => c.id === id); },
  async completeCampaignTask(campaignId, taskId) { await delay(150); campaignState = campaignState.map((c: any) => c.id === campaignId ? { ...c, tasks: c.tasks.map((t: any) => t.id === taskId ? { ...t, done: true } : t) } : c); return campaignState.find((c: any) => c.id === campaignId); },
  async listBadges() { await delay(80); return badges; },
  async getProfile(username) { await delay(120); const u = users.find(x => x.username === username) || (currentUser.username === username ? currentUser : null); if (!u) throw new ClientApiError({ code: "NOT_FOUND", message: "User not found" }); const b = badges.filter(x => u.badgeIds?.includes(x.id)); const userProjects = projects.filter(p => p.team.some(t => t.username === username)); return { ...u, projects: userProjects, campaigns: campaignState, badges: b } as any; },
};
