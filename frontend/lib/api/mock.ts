import type { ApiClient, Profile, UploadSignRequest, UploadSignResponse } from "./types";
import { ClientApiError } from "./errors";
import { ASSET_CATALOG, ASSET_CATEGORY_ORDER, DEFAULT_ASSETS } from "@square/shared";
import { activities as seedActivities, assets as seedAssets, badges, blockedUsers as seedBlocked, campaigns as seedCampaigns, communities as seedCommunities, conversations as seedConversations, directMessages as seedDMs, items as seedItems, memberships as seedMemberships, posts as seedPosts, projects as seedProjects, reservedTaken, schools, users } from "./seed";
import type { Asset, AssetCatalogEntry, AssetItem, AssetPermissions, BlockedUser, Campaign, Community, CommunityDetail, CommunityMember, CommunityMembers, Conversation, DirectMessage, DiscoverBirthday, DiscoverCommunity, DiscoverEvent, DiscoverPerson, DiscoverResponse, DiscoverStudent, ExploreCommunity, Post, PresenceStatus, Project, Role, SearchResult, SearchResults, SearchSuggested, User } from "@square/shared";

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
let posts: Post[] = [...seedPosts];
let assets: Asset[] = JSON.parse(JSON.stringify(seedAssets)) as Asset[];
let items: AssetItem[] = [...seedItems];
const projects = [...seedProjects];
let campaignState: Campaign[] = JSON.parse(JSON.stringify(seedCampaigns)) as Campaign[];
const communitiesState: Community[] = JSON.parse(JSON.stringify(seedCommunities)) as Community[];
const memberships: Record<string, { userId: string; role: Role }[]> = JSON.parse(JSON.stringify(seedMemberships)) as typeof seedMemberships;
let currentUser: User = { ...users[0] };
let verifiedNew = false;
let conversationsState: Conversation[] = JSON.parse(JSON.stringify(seedConversations)) as Conversation[];
let dms: DirectMessage[] = JSON.parse(JSON.stringify(seedDMs)) as DirectMessage[];
let blocked: BlockedUser[] = [...seedBlocked];

function paginate<T>(itemsIn: T[], nextCursor: string | null = null) { return { items: itemsIn, nextCursor }; }
function afterFilter<T extends { createdAt?: string; id: string }>(itemsIn: T[], after?: string): T[] {
  if (!after) return itemsIn;
  const [afterTime, afterId] = after.includes("|") ? after.split("|") : [after, ""];
  return itemsIn.filter(p => (p.createdAt || "") > afterTime || ((p.createdAt || "") === afterTime && p.id > afterId));
}
function communityById(idOrSlug: string) { return communitiesState.find(c => c.id === idOrSlug || c.slug === idOrSlug); }
function assetById(idOrSlug: string) { return assets.find(a => a.id === idOrSlug || a.slug === idOrSlug); }
function roleIn(communityId: string): Role | null { return memberships[communityId]?.find(m => m.userId === currentUser.id)?.role ?? null; }
function roleFor(communityId: string, username: string): Role | null {
  const u = users.find(x => x.username === username);
  return u ? memberships[communityId]?.find(m => m.userId === u.id)?.role ?? null : null;
}
function canRead(asset: Asset, role: Role | null): boolean {
  if (asset.hiddenFromMembers && (!role || role === "member")) return false;
  return role ? asset.permissions.canRead.includes(role) : asset.permissions.canRead.includes("member");
}
function canPost(asset: Asset, role: Role | null): boolean { return !!role && asset.permissions.canPost.includes(role); }
function visibleAssets(communityId: string): Asset[] {
  const role = roleIn(communityId);
  return assets.filter(a => a.communityId === communityId && canRead(a, role)).map(a => ({ ...a, locked: !canPost(a, role) })).sort((a, b) => a.order - b.order);
}
function withCommunityState(c: Community): Community {
  const role = roleIn(c.id);
  return { ...c, joined: !!role, role };
}

function todayBirthdays(): DiscoverBirthday[] {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const bdayUsers = users.filter(u => u.dob && u.dob.slice(5) === todayStr && u.showBirthday);
  return bdayUsers.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, isCurrentUser: u.id === currentUser.id }));
}

function upcomingEvents(): DiscoverEvent[] {
  const now = new Date();
  const eventItems = items.filter(i => i.assetId.endsWith("-events") && i.date && new Date(i.date) >= now).slice(0, 5);
  return eventItems.map(item => {
    const asset = assets.find(a => a.id === item.assetId);
    const community = communitiesState.find(c => c.id === asset?.communityId);
    return { id: item.id, title: item.title, communityName: community?.name || "", communitySlug: community?.slug || "", date: item.date!, time: item.place, place: item.place };
  });
}

function newStudents(): DiscoverStudent[] {
  const currentSchool = currentUser.schoolId;
  if (!currentSchool) return [];
  const recentUsers = users.filter(u => u.schoolId === currentSchool && u.id !== currentUser.id).slice(0, 4);
  return recentUsers.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl }));
}

function suggestedPeople(): DiscoverPerson[] {
  const myCommunities = communitiesState.filter(c => roleIn(c.id));
  const myCommunityIds = new Set(myCommunities.map(c => c.id));
  const mySkills = new Set(currentUser.skills || []);
  
  return users
    .filter(u => u.id !== currentUser.id)
    .map(u => {
      const sharedCommunities = myCommunityIds.size > 0 ? [...myCommunityIds].filter(id => memberships[id]?.some(m => m.userId === u.id)).length : 0;
      const sharedInterests = (u.skills || []).filter(s => mySkills.has(s));
      const canMessage = !blocked.some(b => b.username === u.username);
      return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, schoolName: u.schoolName, sharedCommunities, sharedInterests, interests: u.skills || [], canMessage };
    })
    .filter(p => p.sharedCommunities > 0 || p.sharedInterests.length > 0)
    .sort((a, b) => b.sharedCommunities - a.sharedCommunities || b.sharedInterests.length - a.sharedInterests.length)
    .slice(0, 8);
}

function topCommunities(): DiscoverCommunity[] {
  const joinedSlugs = new Set(currentUser.joinedCommunitySlugs || []);
  return communitiesState
    .filter(c => c.isPublic !== false && !joinedSlugs.has(c.slug))
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, 10)
    .map(c => ({ id: c.id, name: c.name, slug: c.slug, blurb: c.blurb, memberCount: c.memberCount, onlineCount: c.onlineCount, category: c.category, bannerUrl: c.bannerUrl, avatar: c.avatar, isPublic: c.isPublic !== false }));
}

function interestCommunities(): DiscoverCommunity[] {
  const mySkills = new Set(currentUser.skills || []);
  const joinedSlugs = new Set(currentUser.joinedCommunitySlugs || []);
  return communitiesState
    .filter(c => c.isPublic !== false && !joinedSlugs.has(c.slug) && (c.categories || [c.category]).some(cat => mySkills.has(cat)))
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, 6)
    .map(c => ({ id: c.id, name: c.name, slug: c.slug, blurb: c.blurb, memberCount: c.memberCount, onlineCount: c.onlineCount, category: c.category, bannerUrl: c.bannerUrl, avatar: c.avatar, isPublic: c.isPublic !== false }));
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
    currentUser = { id: "u-new", username: data.username, schoolId: data.schoolId, schoolName: schools.find(s => s.id === data.schoolId)?.name, verifiedStudent: true, joinedAt: new Date().toISOString(), badgeIds: ["verified"], skills: [], presence: "online" };
    return { token: "server-cookie" };
  },
  async usernameAvailable(username) { await delay(180); return { available: !reservedTaken.has(username.toLowerCase()) }; },
  async listSchools(query) { await delay(100); const q = (query || "").toLowerCase(); return schools.filter(s => s.name.toLowerCase().includes(q)); },
  async me() { await delay(100); return currentUser; },
  async updateMe(data) { await delay(120); currentUser = { ...currentUser, ...data }; return currentUser; },

  // PROPOSED: not in backend doc
  async createCommunity(data) {
    await delay(220);
    const id = `c_${Date.now()}`;
    const slug = (data.name || "new").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const c: Community = { id, slug, name: data.name || "New community", blurb: data.blurb || "", memberCount: 1, category: data.category || "Web2", categories: [data.category || "Web2"], schoolName: data.schoolName || currentUser.schoolName || "FUT Minna", avatar: (data.name || "NC").slice(0, 2).toUpperCase(), bannerUrl: data.bannerUrl, joined: true, role: "owner", isPublic: true, onlineCount: 1 };
    communitiesState.push(c);
    memberships[id] = [{ userId: currentUser.id, role: "owner" }];
    DEFAULT_ASSETS.forEach((entry, i) => {
      assets.push({ id: `${id}-${entry.key}`, communityId: id, name: entry.name, slug: entry.name, description: entry.description, kind: entry.kind, category: entry.category, template: entry.key, permissions: JSON.parse(JSON.stringify(entry.permissions)) as AssetPermissions, isDefault: true, catalogKey: entry.key, order: i, unreadCount: 0, lastReadPostId: null });
    });
    return c;
  },
  // PROPOSED: not in backend doc
  async getCommunity(id) {
    await delay(100);
    const c = communityById(id);
    if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" });
    const role = roleIn(c.id);
    if (c.isPublic === false && !role) throw new ClientApiError({ code: "FORBIDDEN", message: "This community is private" });
    const detail: CommunityDetail = { community: withCommunityState(c), assets: visibleAssets(c.id) };
    return detail;
  },
  // PROPOSED: not in backend doc
  async joinCommunity(id) {
    await delay(120);
    const c = communityById(id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" });
    if (!roleIn(c.id)) {
      memberships[c.id] = [...(memberships[c.id] || []), { userId: currentUser.id, role: "member" }];
      c.memberCount += 1;
      currentUser = { ...currentUser, joinedCommunitySlugs: [...(currentUser.joinedCommunitySlugs || []), c.slug] };
    }
    return { ok: true };
  },
  // PROPOSED: not in backend doc
  async leaveCommunity(id) {
    await delay(120);
    const c = communityById(id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" });
    memberships[c.id] = (memberships[c.id] || []).filter(m => m.userId !== currentUser.id);
    c.memberCount = Math.max(0, c.memberCount - 1);
    currentUser = { ...currentUser, joinedCommunitySlugs: (currentUser.joinedCommunitySlugs || []).filter(s => s !== c.slug) };
    return { ok: true };
  },
  // PROPOSED: not in backend doc
  async listCommunityMembers(id) {
    await delay(100);
    const c = communityById(id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" });
    const rows: CommunityMember[] = (memberships[c.id] || []).map(m => {
      const u = users.find(x => x.id === m.userId);
      const p = u?.presence;
      return { id: m.userId, username: u?.username || m.userId, role: m.role, presence: !p || p === "hidden" ? "offline" : p };
    });
    const byName = (a: CommunityMember, b: CommunityMember) => a.username.localeCompare(b.username);
    const owners = rows.filter(r => r.role === "owner").sort(byName);
    const moderators = rows.filter(r => r.role === "moderator").sort(byName);
    const rest = rows.filter(r => r.role === "member");
    return { owners, moderators, online: rest.filter(r => r.presence === "online").sort(byName), offline: rest.filter(r => r.presence !== "online").sort(byName) } satisfies CommunityMembers;
  },
  // PROPOSED: not in backend doc
  async myCommunities() { await delay(80); return communitiesState.filter(c => roleIn(c.id)).map(withCommunityState); },
  // PROPOSED: not in backend doc
  async exploreCommunities(params) {
    await delay(140);
    const q = (params?.q || "").trim().toLowerCase();
    const category = (params?.category || "").trim();
    let list = communitiesState.filter(c => c.isPublic !== false);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (c.blurb || "").toLowerCase().includes(q));
    if (category && category !== "All") {
      if (category === "My school") list = list.filter(c => c.schoolName === currentUser.schoolName);
      else list = list.filter(c => (c.categories || [c.category]).some(x => x.toLowerCase() === category.toLowerCase()));
    }
    if (params?.school) list = list.filter(c => c.schoolName === params.school);
    if (params?.sort === "new") list = [...list].reverse();
    else list = [...list].sort((a, b) => b.memberCount - a.memberCount);
    const out: ExploreCommunity[] = list.map(c => ({ ...withCommunityState(c), relation: roleIn(c.id) ? "member" : "none" }));
    return paginate(out);
  },

  // PROPOSED: not in backend doc
  async getAssetCatalog() { await delay(80); return [...DEFAULT_ASSETS, ...ASSET_CATALOG] as AssetCatalogEntry[]; },
  // PROPOSED: not in backend doc
  async addAsset(communityId, catalogKey) {
    await delay(140);
    const c = communityById(communityId); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" });
    const entry = [...DEFAULT_ASSETS, ...ASSET_CATALOG].find(a => a.key === catalogKey);
    if (!entry) throw new ClientApiError({ code: "NOT_FOUND", message: "Unknown asset" });
    if (assets.some(a => a.communityId === c.id && a.catalogKey === catalogKey)) throw new ClientApiError({ code: "CONFLICT", message: "Asset already exists" });
    const a: Asset = { id: `${c.id}-${entry.key}-${Date.now()}`, communityId: c.id, name: entry.name, slug: entry.name, description: entry.description, kind: entry.kind, category: entry.category, template: entry.key, permissions: JSON.parse(JSON.stringify(entry.permissions)) as AssetPermissions, isDefault: false, catalogKey: entry.key, order: assets.filter(x => x.communityId === c.id).length, hiddenFromMembers: entry.hiddenFromMembers, unreadCount: 0, lastReadPostId: null };
    assets.push(a);
    return a;
  },
  // PROPOSED: not in backend doc
  async deleteAsset(assetId) {
    await delay(120);
    const a = assetById(assetId); if (!a) throw new ClientApiError({ code: "NOT_FOUND", message: "Asset not found" });
    if (a.isDefault) throw new ClientApiError({ code: "FORBIDDEN", message: "Default assets cannot be deleted" });
    assets = assets.filter(x => x.id !== a.id);
    posts = posts.filter(p => p.assetId !== a.id);
    return { ok: true };
  },
  // PROPOSED: not in backend doc
  async updateAssetPermissions(assetId, permissions) {
    await delay(120);
    assets = assets.map(a => a.id === assetId ? { ...a, permissions } : a);
    const a = assetById(assetId); if (!a) throw new ClientApiError({ code: "NOT_FOUND", message: "Asset not found" });
    return a;
  },
  // PROPOSED: not in backend doc
  async markAssetRead(assetId) {
    await delay(60);
    assets = assets.map(a => a.id === assetId ? { ...a, unreadCount: 0, lastReadPostId: posts.filter(p => p.assetId === assetId).at(-1)?.id || null } : a);
    return { ok: true };
  },

  async listPosts(assetId, opts) {
    await delay(100);
    const itemsOut = afterFilter(posts.filter(p => p.assetId === assetId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)), opts?.after);
    return paginate(itemsOut);
  },
  async createPost(assetId, data) {
    await delay(120);
    const a = assetById(assetId);
    const c = a ? communityById(a.communityId) : undefined;
    const p: Post = { id: `p_${Date.now()}`, assetId, authorId: currentUser.id, authorUsername: currentUser.username, content: data.content, createdAt: new Date().toISOString(), media: data.media, communityId: c?.id, communityName: c?.name, communitySlug: c?.slug, assetName: a?.name, assetSlug: a?.slug, replyToId: data.replyToId, replyPreview: data.replyPreview };
    posts.push(p);
    return p;
  },
  // PROPOSED: not in backend doc
  async listItems(assetId) { await delay(100); return items.filter(i => i.assetId === assetId).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt.localeCompare(a.createdAt)); },
  // PROPOSED: not in backend doc
  async createItem(assetId, data) {
    await delay(120);
    const item: AssetItem = { id: `i_${Date.now()}`, assetId, title: data.title || "Untitled", description: data.description, date: data.date, place: data.place, link: data.link, createdAt: new Date().toISOString(), createdBy: currentUser.id };
    items.push(item);
    return item;
  },
  // PROPOSED: not in backend doc
  async deleteItem(assetId, itemId) { await delay(80); items = items.filter(i => !(i.id === itemId && i.assetId === assetId)); return { ok: true }; },
  async signUpload(_data: UploadSignRequest): Promise<UploadSignResponse> { void _data; await delay(120); return { signature: "mock", timestamp: Date.now(), cloudName: "demo", apiKey: "mock", folder: "square" }; },

  // PROPOSED: not in backend doc
  async homeFeed(opts) {
    await delay(120);
    const feedAssetIds = new Set(assets.filter(a => a.kind === "feed" && roleIn(a.communityId)).map(a => a.id));
    const list = afterFilter(posts.filter(p => feedAssetIds.has(p.assetId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)), opts?.after);
    return paginate(list.slice(0, 40));
  },

  // PROPOSED: not in backend doc
  async listProjects(assetId) { await delay(100); return projects.filter(p => p.assetId === assetId); },
  // PROPOSED: not in backend doc
  async getProject(id) { await delay(80); const p = projects.find(x => x.id === id); if (!p) throw new ClientApiError({ code: "NOT_FOUND", message: "Project not found" }); return p; },
  // PROPOSED: not in backend doc
  async createProject(assetId, data) {
    await delay(120);
    const p: Project = { id: `pr_${Date.now()}`, assetId, title: data.title || "Untitled project", status: data.status || "idea", description: data.description || "", needs: data.needs || [], teamCount: 1, team: [{ id: currentUser.id, username: currentUser.username }], milestones: [], rolesNeeded: data.rolesNeeded || [], updates: [] };
    projects.push(p);
    return p;
  },
  // PROPOSED: not in backend doc
  async listCampaigns(assetId) { await delay(100); return campaignState.filter(c => c.assetId === assetId); },
  // PROPOSED: not in backend doc
  async getCampaign(id) { await delay(80); const c = campaignState.find(x => x.id === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Campaign not found" }); return c; },
  // PROPOSED: not in backend doc
  async joinCampaign(id) { await delay(100); campaignState = campaignState.map(c => c.id === id ? { ...c, joined: c.joined + 1 } : c); const c = campaignState.find(x => x.id === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Campaign not found" }); return c; },
  // PROPOSED: not in backend doc
  async completeCampaignTask(campaignId, taskId) {
    await delay(100);
    campaignState = campaignState.map(c => c.id === campaignId ? { ...c, tasks: c.tasks.map(t => t.id === taskId ? { ...t, done: true } : t) } : c);
    const c = campaignState.find(x => x.id === campaignId);
    if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Campaign not found" });
    return c;
  },
  // PROPOSED: not in backend doc
  async listBadges() { await delay(80); return badges; },
  // PROPOSED: not in backend doc
  async getProfile(username) {
    await delay(120);
    const u = users.find(x => x.username === username);
    if (!u) throw new ClientApiError({ code: "NOT_FOUND", message: "User not found" });
    const joined = communitiesState.filter(c => roleFor(c.id, username));
    const myCommunities = new Set(communitiesState.filter(c => roleIn(c.id)).map(c => c.id));
    const inCommonCount = joined.filter(c => myCommunities.has(c.id)).length;
    const mutualAvatars = joined
      .filter(c => myCommunities.has(c.id))
      .flatMap(c => (memberships[c.id] || []).map(m => m.userId))
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .filter(id => id !== currentUser.id)
      .map(id => {
        const uu = users.find(x => x.id === id);
        return { id: uu?.id || id, username: uu?.username || id, avatarUrl: uu?.avatarUrl };
      })
      .slice(0, 3);
    const badgePins = (u.badgeIds || []).slice(0, 5);
    const featuredProjectId = (u.skills || []).length > 0 ? (projects.find(p => p.team.some(t => t.username === username))?.id) : undefined;
    const profile: Profile = {
      ...u,
      projects: projects.filter(p => p.team.some(t => t.username === username)),
      campaigns: campaignState.filter(c => c.leaderboard.some(l => l.username === username)),
      badges: badges.filter(b => (u.badgeIds || []).includes(b.id)),
      communitiesJoined: joined.length,
      joinedCommunities: joined.map(withCommunityState),
      relations: { blocked: blocked.some(b => b.username === username), blockedBy: false, inCommonCount },
      stats: {
        communities: joined.length,
        badges: (u.badgeIds || []).length,
        projects: projects.filter(p => p.team.some(t => t.username === username)).length,
      },
      badgePins,
      featuredProjectId,
      mutualAvatars,
      presence: u.presence,
    };
    return profile;
  },
  // PROPOSED: not in backend doc
  async getProfileProjects(username) {
    await delay(100);
    return projects.filter(p => p.team.some(t => t.username === username));
  },
  // PROPOSED: not in backend doc
  async getProfileActivity(username) {
    await delay(100);
    return [...seedActivities].filter(a => a.actorUsername === username).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  // PROPOSED: not in backend doc
  async getProfileBadges(username) {
    await delay(80);
    const u = users.find(x => x.username === username);
    if (!u) throw new ClientApiError({ code: "NOT_FOUND", message: "User not found" });
    return badges.filter(b => (u.badgeIds || []).includes(b.id));
  },
  // PROPOSED: not in backend doc
  async sharedCommunities(username) {
    await delay(80);
    return communitiesState.filter(c => roleFor(c.id, username) && roleIn(c.id)).map(withCommunityState);
  },

  // PROPOSED: not in backend doc
  async listConversations() { await delay(100); return [...conversationsState].sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")); },
  // PROPOSED: not in backend doc
  async getOrCreateConversation(username) {
    await delay(120);
    const existing = conversationsState.find(c => c.participant.username === username);
    if (existing) return existing;
    const u = users.find(x => x.username === username) || { id: username, username, presence: "offline" as const };
    const conv: Conversation = { id: `dm_${Date.now()}`, participant: { id: u.id, username: u.username }, otherUserId: u.id, unreadCount: 0, blocked: blocked.some(b => b.username === username), presence: u.presence === "hidden" ? "offline" : u.presence };
    conversationsState = [conv, ...conversationsState];
    return conv;
  },
  // PROPOSED: not in backend doc
  async getConversation(id) { await delay(80); const c = conversationsState.find(x => x.id === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Conversation not found" }); return c; },
  // PROPOSED: not in backend doc
  async listMessages(conversationId, opts) { await delay(100); const out = afterFilter(dms.filter(m => m.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)), opts?.after); return paginate(out); },
  // PROPOSED: not in backend doc
  async sendMessage(conversationId, text, opts) {
    await delay(120);
    const conv = conversationsState.find(c => c.id === conversationId);
    if (conv?.blocked) throw new ClientApiError({ code: "BLOCKED", message: "Blocked" });
    const m: DirectMessage = { id: `m_${Date.now()}`, conversationId, senderId: currentUser.id, text, createdAt: new Date().toISOString(), status: "sent", replyToId: opts?.replyToId, replyPreview: opts?.replyPreview };
    dms.push(m);
    conversationsState = conversationsState.map(c => c.id === conversationId ? { ...c, lastMessage: text, lastMessagePreview: text, lastMessageAt: m.createdAt } : c);
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

  // PROPOSED: not in backend doc
  async search(q) {
    await delay(120);
    const term = q.trim().toLowerCase();
    if (term.length < 2) return { people: [], dms: [], communities: [] };
    const pres = (id: string): PresenceStatus => { const p = users.find(u => u.id === id)?.presence; return !p || p === "hidden" ? "offline" : p; };
    const people: SearchResult[] = users.filter(u => u.username.toLowerCase().includes(term)).slice(0, 5).map(u => ({ kind: "person", id: u.id, username: u.username, presence: pres(u.id) }));
    const dmResults: SearchResult[] = conversationsState.filter(c => !c.blocked && c.participant.username.toLowerCase().includes(term)).slice(0, 5).map(c => ({ kind: "dm", id: c.id, username: c.participant.username, preview: c.lastMessagePreview || c.lastMessage, presence: c.presence }));
    const comms: SearchResult[] = communitiesState.filter(c => c.isPublic !== false && c.name.toLowerCase().includes(term)).slice(0, 6).map(c => ({ kind: "community", id: c.id, name: c.name, slug: c.slug, blurb: c.blurb, memberCount: c.memberCount }));
    return { people, dms: dmResults, communities: comms } as SearchResults;
  },
  // PROPOSED: not in backend doc
  async searchSuggested() {
    await delay(100);
    const pres = (id: string): PresenceStatus => { const p = users.find(u => u.id === id)?.presence; return !p || p === "hidden" ? "offline" : p; };
    const people: SearchResult[] = users.filter(u => u.id !== currentUser.id).slice(0, 3).map(u => ({ kind: "person", id: u.id, username: u.username, schoolName: u.schoolName, presence: pres(u.id) }));
    const comms: SearchResult[] = communitiesState.filter(c => c.isPublic !== false).slice(0, 3).map(c => ({ kind: "community", id: c.id, name: c.name, slug: c.slug, memberCount: c.memberCount, category: c.category }));
    return { people, communities: comms } as SearchSuggested;
  },
  // PROPOSED: not in backend doc
  async getPresence(ids) {
    await delay(60);
    return Object.fromEntries(ids.map(id => {
      if (id === currentUser.id) return [id, currentUser.presence ?? "online"] as const;
      const p = users.find(u => u.id === id || u.username === id)?.presence;
      return [id, (!p || p === "hidden" ? "offline" : p)] as const;
    })) as Record<string, PresenceStatus>;
  },
  // PROPOSED: not in backend doc
  async setPresence(mode) {
    await delay(80);
    currentUser = { ...currentUser, presence: mode === "offline" ? "hidden" : "online" };
    return { presence: currentUser.presence ?? "online" };
  },
  // PROPOSED: not in backend doc
  async recentDms(limit = 6) {
    await delay(80);
    return [...conversationsState].filter(c => !c.blocked).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")).slice(0, limit);
  },
  // PROPOSED: not in backend doc
  async setConversationMuted(conversationId, muted) {
    await delay(80);
    conversationsState = conversationsState.map(c => c.id === conversationId ? { ...c, muted } : c);
    const c = conversationsState.find(x => x.id === conversationId);
    if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Conversation not found" });
    return c;
  },
  // PROPOSED: not in backend doc
  async hideConversation(conversationId) { await delay(80); conversationsState = conversationsState.filter(c => c.id !== conversationId); return { ok: true }; },

  // PROPOSED: not in backend doc
  async discover() {
    await delay(200);
    const sections: DiscoverResponse["sections"] = [
      { id: "topCommunities", items: topCommunities() },
      { id: "peopleYouMayKnow", items: suggestedPeople() },
      { id: "birthdays", items: todayBirthdays() },
      { id: "events", items: upcomingEvents() },
      { id: "newStudents", items: newStudents() },
      { id: "interestCommunities", items: interestCommunities() },
    ];
    return { sections };
  },
  // PROPOSED: not in backend doc
  async dismissPerson() {
    await delay(60);
    return { ok: true };
  },
  // PROPOSED: not in backend doc
  async updatePrivacy(data) {
    await delay(100);
    currentUser = { ...currentUser, showBirthday: data.showBirthday };
    return { ok: true };
  },
};

void ASSET_CATEGORY_ORDER;
