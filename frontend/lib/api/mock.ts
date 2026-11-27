import type { ApiClient, Profile, UploadSignRequest, UploadSignResponse } from "./types";
import { ClientApiError } from "./errors";
import { withTimeout } from "./timeout";
import { ADD_ASSET_ROLES, ASSET_CATALOG, ASSET_CATEGORY_ORDER, DEFAULT_ASSETS, getAssetCatalogEntry } from "@square/shared";
import {
  authRequestCodeRequestSchema,
  authRequestCodeResponseSchema,
  authSessionSchema,
  authSignupRequestSchema,
  authSignupResponseSchema,
  apiOkResponseSchema,
  authUserSchema,
  authVerifyCodeRequestSchema,
  authVerifyCodeResponseSchema,
  mentionRecordSchema,
  mentionSeenRequestSchema,
  mentionableMembersPageSchema,
  mentionableQuerySchema,
  reactionPathSchema,
  reactionRequestSchema,
  reactionUpdatedEventSchema,
  reactionUsersQuerySchema,
  reactionUsersPageSchema,
  schoolSchema,
  schoolSearchQuerySchema,
  userSchema,
  usernameAvailableQuerySchema,
  usernameAvailableResponseSchema,
  unreadCountsSchema,
} from "@square/shared";
import { clearSession } from "../session";
import {
  MAX_DISTINCT_REACTIONS_PER_MESSAGE,
  MAX_REACTIONS_PER_USER_PER_MESSAGE,
  QUICK_REACTIONS,
  addReactionSummary,
  isAllowedReactionEmoji,
  removeReactionSummary,
} from "@square/shared";
import { activities as seedActivities, assets as seedAssets, badges, blockedUsers as seedBlocked, campaigns as seedCampaigns, communities as seedCommunities, conversations as seedConversations, directMessages as seedDMs, items as seedItems, memberships as seedMemberships, posts as seedPosts, projects as seedProjects, reservedTaken, schoolAliases, schools, users } from "./seed";
import type { Asset, AssetCatalogEntry, AssetCategoryGroup, AssetItem, AssetPermissions, AuthSession, BlockedUser, Campaign, Community, CommunityDetail, CommunityMember, CommunityMembers, Conversation, DirectMessage, DiscoverBirthday, DiscoverCommunity, DiscoverEvent, DiscoverPerson, DiscoverResponse, DiscoverStudent, ExploreCommunity, MentionRecord, MentionScope, MentionableMember, Post, PresenceStatus, Project, ReactionScope, ReactionSummary, ReactionUpdatedEvent, ReactionUser, Role, SearchResult, SearchResults, SearchSuggested, User } from "@square/shared";

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
let posts: Post[] = [...seedPosts];
let assets: Asset[] = JSON.parse(JSON.stringify(seedAssets)) as Asset[];
let items: AssetItem[] = [...seedItems];
let projects = [...seedProjects];
let campaignState: Campaign[] = JSON.parse(JSON.stringify(seedCampaigns)) as Campaign[];
const communitiesState: Community[] = JSON.parse(JSON.stringify(seedCommunities)) as Community[];
const memberships: Record<string, { userId: string; role: Role }[]> = JSON.parse(JSON.stringify(seedMemberships)) as typeof seedMemberships;
let currentUser: User = { ...users[0] };
let conversationsState: Conversation[] = JSON.parse(JSON.stringify(seedConversations)) as Conversation[];
let dms: DirectMessage[] = JSON.parse(JSON.stringify(seedDMs)) as DirectMessage[];
let blocked: BlockedUser[] = [...seedBlocked];
const authAttempts = new Map<string, number>();
const initialMockSessions = authSessionSchema.array().parse([{
  id: "mock-session-current",
  createdAt: new Date().toISOString(),
  lastUsedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  current: true,
}]);
const mockSessionsByUser = new Map<string, AuthSession[]>([[users[0].id, initialMockSessions]]);
let mockAuthenticatedUserId: string | null = users[0].id;
const reactionListeners = new Map<string, { listeners: Set<(event: ReactionUpdatedEvent) => void>; timer?: ReturnType<typeof setInterval>; tick: number }>();
type MockMention = MentionRecord & { scope: MentionScope; roomId: string; userId: string };
let mentionSequence = 0;
const mockMentions: MockMention[] = [
  ...posts.flatMap(message => (message.mentionedUserIds || []).map(userId => ({
    scope: "asset" as const, roomId: message.assetId, userId, messageId: message.id, seq: ++mentionSequence, createdAt: message.createdAt,
  }))),
  ...dms.flatMap(message => (message.mentionedUserIds || []).map(userId => ({
    scope: "dm" as const, roomId: message.conversationId, userId, messageId: message.id, seq: ++mentionSequence, createdAt: message.createdAt,
  }))),
];
const seenMockMentions = new Set<string>();

function requireMockSession(): string {
  if (!mockAuthenticatedUserId) {
    throw new ClientApiError({ code: "unauthenticated", message: "Sign in to continue" });
  }
  return mockAuthenticatedUserId;
}

function startMockSession(userId: string): void {
  const sessions = mockSessionsByUser.get(userId) ?? [];
  if (sessions.length === 0) {
    const now = new Date();
    mockSessionsByUser.set(userId, authSessionSchema.array().parse([{
      id: `mock-session-${crypto.randomUUID()}`,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      current: true,
    }]));
  }
  mockAuthenticatedUserId = userId;
}

const MOCK_USERS_KEY = "square.mock-users.v1";
const MOCK_TICKETS_KEY = "square.mock-signup-tickets.v1";
const MOCK_LAST_USER_KEY = "square.mock-session-user.v1";
const initialAccounts = [
  { email: "amaka@example.com", user: users[0], profileComplete: true },
  { email: "tunde@example.com", user: users[1], profileComplete: true },
  { email: "kemi@example.com", user: users[2], profileComplete: true },
];
type MockAccount = { email: string; user: User; profileComplete: boolean };
type SignupTicket = { email: string; expiresAt: number };

function sanitizedUserData(user: User): Record<string, unknown> {
  return Object.fromEntries(Object.entries(user).filter(([key]) => key !== "dob" && key !== "email"));
}

function toPublicUser(user: User): User {
  return userSchema.parse(sanitizedUserData(user));
}

function toAuthUser(user: User) {
  const account = mockAccounts.find((entry) => entry.user.id === user.id);
  return authUserSchema.parse({ ...sanitizedUserData(user), profileComplete: account?.profileComplete ?? false });
}

function readAccounts(): MockAccount[] {
  if (typeof window === "undefined") return initialAccounts;
  try {
    const stored = window.localStorage.getItem(MOCK_USERS_KEY);
    if (!stored) {
      window.localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(initialAccounts));
      return initialAccounts;
    }
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every((entry) => entry && typeof entry.email === "string" && entry.user?.id)) {
      const byEmail = new Map(initialAccounts.map((account) => [account.email, account]));
      for (const stored of parsed as Array<Partial<MockAccount>>) {
        const email = stored.email!.toLowerCase();
        const seeded = initialAccounts.find((account) => account.email === email && account.user.id === stored.user!.id);
        byEmail.set(email, {
          email,
          user: stored.user!,
          profileComplete: typeof stored.profileComplete === "boolean" ? stored.profileComplete : seeded?.profileComplete ?? false,
        });
      }
      const merged = [...byEmail.values()];
      window.localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch {
    // Storage may be disabled; seeded in-memory accounts remain available.
  }
  return initialAccounts;
}

function saveAccounts(accounts: MockAccount[]) {
  try { window.localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(accounts)); } catch { /* Memory-only fallback. */ }
}

function readTickets(): Record<string, SignupTicket> {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.sessionStorage.getItem(MOCK_TICKETS_KEY);
    return stored ? JSON.parse(stored) as Record<string, SignupTicket> : {};
  } catch {
    return {};
  }
}

function saveTickets(tickets: Record<string, SignupTicket>) {
  try { window.sessionStorage.setItem(MOCK_TICKETS_KEY, JSON.stringify(tickets)); } catch { /* Ticket validation still has its server-contract expiry. */ }
}

let mockAccounts = readAccounts();
for (const account of mockAccounts) {
  if (!users.some((user) => user.id === account.user.id)) users.push(toPublicUser(account.user));
}
if (typeof window !== "undefined") {
  try {
    const activeId = window.localStorage.getItem(MOCK_LAST_USER_KEY);
    const active = mockAccounts.find((account) => account.user.id === activeId);
    if (active) currentUser = toPublicUser(active.user);
  } catch { /* Keep the seeded user when storage is unavailable. */ }
}

function reactionRoomKey(scope: ReactionScope, roomId: string) { return `${scope}:${roomId}`; }
function mentionKey(scope: MentionScope, roomId: string, messageId: string, userId: string) {
  return `${scope}:${roomId}:${messageId}:${userId}`;
}
function unseenMentions(scope: MentionScope, roomId: string) {
  return mockMentions
    .filter(mention => mention.scope === scope && mention.roomId === roomId && mention.userId === currentUser.id && !seenMockMentions.has(mentionKey(scope, roomId, mention.messageId, mention.userId)))
    .sort((a, b) => a.seq - b.seq);
}
function unreadMentionCount(scope: MentionScope, roomId: string, unread: number) {
  return Math.min(Math.max(0, unread), unseenMentions(scope, roomId).length);
}
function recordMentions(scope: MentionScope, roomId: string, messageId: string, createdAt: string, ids: string[]) {
  for (const userId of new Set(ids)) {
    if (userId === currentUser.id || mockMentions.some(mention => mention.scope === scope && mention.roomId === roomId && mention.messageId === messageId && mention.userId === userId)) continue;
    mockMentions.push({ scope, roomId, messageId, userId, seq: ++mentionSequence, createdAt });
  }
}
function getReactionMessage(scope: ReactionScope, roomId: string, messageId: string): Post | DirectMessage | undefined {
  return scope === "asset"
    ? posts.find(message => message.id === messageId && message.assetId === roomId)
    : dms.find(message => message.id === messageId && message.conversationId === roomId);
}
function emitReactionEvent(event: ReactionUpdatedEvent) {
  const validatedEvent = reactionUpdatedEventSchema.parse(event);
  reactionListeners.get(reactionRoomKey(event.scope, event.roomId))?.listeners.forEach(listener => listener(validatedEvent));
}
function updateReactionCount(message: Post | DirectMessage, emoji: string, count: number) {
  const reactions = message.reactions || [];
  const exists = reactions.some(reaction => reaction.emoji === emoji);
  message.reactions = count > 0
    ? exists
      ? reactions.map(reaction => reaction.emoji === emoji ? { ...reaction, count } : reaction)
      : [...reactions, { emoji, count, me: false }]
    : reactions.filter(reaction => reaction.emoji !== emoji);
}
function paginate<T>(itemsIn: T[], nextCursor: string | null = null) { return { items: itemsIn, nextCursor }; }
function afterFilter<T extends { createdAt?: string; id: string }>(itemsIn: T[], after?: string): T[] {
  if (!after) return itemsIn;
  const [afterTime, afterId] = after.includes("|") ? after.split("|") : [after, ""];
  return itemsIn.filter(p => (p.createdAt || "") > afterTime || ((p.createdAt || "") === afterTime && p.id > afterId));
}
function communityById(idOrSlug: string) { return communitiesState.find(c => c.id === idOrSlug || c.slug === idOrSlug); }
function assetById(idOrSlug: string) { return assets.find(a => a.id === idOrSlug || a.slug === idOrSlug); }
function roleIn(communityId: string): Role | null { return memberships[communityId]?.find(m => m.userId === currentUser.id)?.role ?? null; }
function canManageAssets(communityId: string): boolean {
  const role = roleIn(communityId);
  return role !== null && (ADD_ASSET_ROLES as readonly Role[]).includes(role);
}
function roleFor(communityId: string, username: string): Role | null {
  const u = users.find(x => x.username === username);
  return u ? memberships[communityId]?.find(m => m.userId === u.id)?.role ?? null : null;
}
function canRead(asset: Asset, role: Role | null): boolean {
  if (asset.hiddenFromMembers && (!role || role === "member")) return false;
  return role ? asset.permissions.canRead.includes(role) : asset.permissions.canRead.includes("member");
}
function canPost(asset: Asset, role: Role | null): boolean { return !!role && asset.permissions.canPost.includes(role); }
function assetFromCatalog(communityId: string, entry: AssetCatalogEntry, order: number): Asset {
  return {
    id: `${communityId}-${entry.key}`,
    communityId,
    name: entry.name,
    slug: entry.key,
    description: entry.description,
    kind: entry.kind,
    category: entry.category,
    permissions: JSON.parse(JSON.stringify(entry.permissions)) as AssetPermissions,
    isDefault: !!entry.isDefault,
    catalogKey: entry.key,
    order,
    hiddenFromMembers: entry.hiddenFromMembers,
    unreadCount: 0,
    lastReadPostId: null,
  };
}
function allCommunityAssets(communityId: string): Asset[] {
  const communityAssets = assets.filter(asset => asset.communityId === communityId);
  const byKey = new Map(communityAssets.map(asset => [asset.catalogKey, asset]));
  const defaults = DEFAULT_ASSETS.map((entry, order) => {
    const stored = byKey.get(entry.key);
    const asset = stored || assetFromCatalog(communityId, entry, order);
    return {
      ...asset,
      name: entry.name,
      slug: entry.key,
      description: entry.description,
      kind: entry.kind,
      category: entry.category,
      permissions: JSON.parse(JSON.stringify(entry.permissions)) as AssetPermissions,
      isDefault: true,
      catalogKey: entry.key,
      order,
      hiddenFromMembers: entry.hiddenFromMembers,
    };
  });
  const optional = communityAssets
    .filter(asset => !DEFAULT_ASSETS.some(entry => entry.key === asset.catalogKey))
    .map(asset => {
      const entry = getAssetCatalogEntry(asset.catalogKey);
      if (!entry || entry.isDefault) throw new Error(`Unknown asset catalog key: ${asset.catalogKey || asset.id}`);
      return { ...asset, name: entry.name, slug: entry.key, kind: entry.kind, category: entry.category, catalogKey: entry.key, isDefault: false };
    });
  return [...defaults, ...optional];
}
function groupedAssets(communityId: string): AssetCategoryGroup[] {
  const visible = visibleAssets(communityId);
  return ASSET_CATEGORY_ORDER
    .map(category => ({ category, assets: visible.filter(asset => getAssetCatalogEntry(asset.catalogKey)?.category === category) }))
    .filter(group => group.assets.length > 0);
}
function visibleAssets(communityId: string): Asset[] {
  const role = roleIn(communityId);
  const categoryOrder = new Map(ASSET_CATEGORY_ORDER.map((category, index) => [category, index]));
  return allCommunityAssets(communityId)
    .filter(asset => canRead(asset, role))
    .map(asset => summarizeAsset({ ...asset, locked: !canPost(asset, role) }))
    .sort((a, b) => (categoryOrder.get(getAssetCatalogEntry(a.catalogKey)?.category || "Information") ?? 0) - (categoryOrder.get(getAssetCatalogEntry(b.catalogKey)?.category || "Information") ?? 0) || a.order - b.order);
}
function withCommunityState(c: Community): Community {
  const role = roleIn(c.id);
  return { ...c, joined: !!role, role };
}
function summarizeAsset(asset: Asset): Asset {
  const unread = asset.unreadCount || 0;
  return { ...asset, mentions: unreadMentionCount("asset", asset.id, unread) };
}
function summarizeConversation(conversation: Conversation): Conversation {
  return { ...conversation, mentions: unreadMentionCount("dm", conversation.id, conversation.unreadCount) };
}
const largePickerMembers: MentionableMember[] = Array.from({ length: 500 }, (_, index) => {
  const suffix = String(index + 1).padStart(3, "0");
  return { id: `wc-picker-${suffix}`, username: `campus-member-${suffix}`, schoolName: "Western College", role: "member", presence: index % 4 === 0 ? "online" : "offline" };
});
function mentionableCandidates(scope: MentionScope, roomId: string): MentionableMember[] {
  if (scope === "dm") {
    const conversation = conversationsState.find(item => item.id === roomId);
    if (!conversation) throw new ClientApiError({ code: "NOT_FOUND", message: "Conversation not found" });
    const person = users.find(user => user.id === conversation.participant.id);
    return [{
      id: conversation.participant.id,
      username: conversation.participant.username,
      avatarUrl: person?.avatarUrl,
      schoolName: person?.schoolName,
      presence: person?.presence,
    }];
  }
  const asset = assetById(roomId);
  if (!asset) throw new ClientApiError({ code: "NOT_FOUND", message: "Asset not found" });
  const memberRows = memberships[asset.communityId] || [];
  const candidates = memberRows
    .filter(row => asset.permissions.canRead.includes(row.role))
    .map((row): MentionableMember | null => {
      const person = users.find(user => user.id === row.userId);
      return person ? {
        id: person.id, username: person.username, avatarUrl: person.avatarUrl, schoolName: person.schoolName,
        role: row.role, presence: person.presence,
      } : null;
    })
    .filter((member): member is MentionableMember => member !== null);
  if (asset.communityId === "wc" && asset.permissions.canRead.includes("member")) candidates.push(...largePickerMembers);
  const recentSpeakerIds = (scope === "asset" ? posts.filter(post => post.assetId === roomId) : [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200)
    .map(post => post.authorId);
  const recentRank = new Map(recentSpeakerIds.map((id, index) => [id, index]));
  return candidates.sort((a, b) =>
    (recentRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (recentRank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    || a.username.localeCompare(b.username),
  );
}
function resolveMentionIds(scope: MentionScope, roomId: string, text: string): string[] {
  const safeText = text.replace(/`+[^`]*`+/g, " ");
  const candidates = mentionableCandidates(scope, roomId);
  const byUsername = new Map(candidates.map(member => [member.username.replace(/^#/, "").toLowerCase(), member]));
  const ids: string[] = [];
  const token = /(^|[^\p{L}\p{N}._%+-])@([\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+(?:-[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+)*)/gu;
  for (const match of safeText.matchAll(token)) {
    const member = byUsername.get(match[2].toLowerCase());
    if (!member || member.id === currentUser.id || blocked.some(entry => entry.id === member.id || entry.username === member.username)) continue;
    if (!ids.includes(member.id)) ids.push(member.id);
    if (ids.length === 5) break;
  }
  return ids;
}

function todayBirthdays(): DiscoverBirthday[] {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const bdayUsers = users.filter(u => u.birthdayToday && u.showBirthday);
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

export const mockApi: ApiClient = withTimeout({
  async requestCode(email) {
    const request = authRequestCodeRequestSchema.parse({ email });
    await delay();
    authAttempts.set(request.email.trim().toLowerCase(), 0);
    return authRequestCodeResponseSchema.parse({ ok: true });
  },
  async verifyCode(email, code) {
    await delay();
    const request = authVerifyCodeRequestSchema.parse({ email, code });
    const normalizedEmail = request.email.trim().toLowerCase();
    if (code === "000000") {
      const attempts = (authAttempts.get(normalizedEmail) || 0) + 1;
      authAttempts.set(normalizedEmail, attempts);
      if (attempts >= 5) {
        throw new ClientApiError({ code: "too_many_attempts", message: "Too many attempts. Request a new code.", field: "code" });
      }
      throw new ClientApiError({ code: "code_invalid", message: "That code is invalid", field: "code" });
    }
    const account = mockAccounts.find((entry) => entry.email.toLowerCase() === request.email.trim().toLowerCase());
    if (account) {
      currentUser = toPublicUser(account.user);
      startMockSession(account.user.id);
      try { window.localStorage.setItem(MOCK_LAST_USER_KEY, currentUser.id); } catch { /* Session cookie remains authoritative. */ }
      return authVerifyCodeResponseSchema.parse({ isNewUser: false, user: authUserSchema.parse({ ...sanitizedUserData(account.user), profileComplete: account.profileComplete }) });
    }
    const signupTicket = `mock_${crypto.randomUUID()}`;
    const tickets = readTickets();
    tickets[signupTicket] = { email: request.email.trim().toLowerCase(), expiresAt: Date.now() + 15 * 60 * 1000 };
    saveTickets(tickets);
    return authVerifyCodeResponseSchema.parse({ isNewUser: true, signupTicket });
  },
  async signup(data) {
    const request = authSignupRequestSchema.parse(data);
    await delay();
    const tickets = readTickets();
    const ticket = tickets[request.signupTicket];
    if (!ticket || ticket.expiresAt <= Date.now()) {
      delete tickets[request.signupTicket];
      saveTickets(tickets);
      throw new ClientApiError({ code: "signup_ticket_invalid", message: "Signup ticket is invalid" });
    }
    if (mockAccounts.some((account) => account.email === ticket.email)) {
      throw new ClientApiError({ code: "ACCOUNT_EXISTS", message: "Account already exists" });
    }
    const normalized = request.username.replace(/^#/, "").toLowerCase();
    if (!normalized || mockAccounts.some((account) => account.user.username.toLowerCase() === normalized) || reservedTaken.has(`#${normalized}`)) {
      throw new ClientApiError({ code: "USERNAME_TAKEN", message: "Username is unavailable", field: "username" });
    }
    const school = schools.find((entry) => entry.id === request.schoolId);
    if (!school || !request.dateOfBirth || new Date(request.dateOfBirth).toString() === "Invalid Date") {
      throw new ClientApiError({ code: "INVALID_SIGNUP", message: "Signup details are invalid" });
    }
    const birthDate = new Date(`${request.dateOfBirth}T00:00:00`);
    const ageLimit = new Date();
    ageLimit.setFullYear(ageLimit.getFullYear() - 16);
    if (birthDate > ageLimit || birthDate > new Date()) {
      throw new ClientApiError({ code: "age_not_allowed", message: "Age requirement not met" });
    }
    const created: User = {
      id: `u_${crypto.randomUUID()}`,
      username: normalized,
      schoolId: school.id,
      schoolName: school.name,
      educationStatus: request.educationStatus,
      verifiedStudent: false,
      joinedAt: new Date().toISOString(),
      badgeIds: [],
      skills: [],
      presence: "online",
    };
    const account: MockAccount = { email: ticket.email, user: created, profileComplete: true };
    mockAccounts = [...mockAccounts, account];
    saveAccounts(mockAccounts);
    users.push(created);
    currentUser = created;
    startMockSession(created.id);
    try { window.localStorage.setItem(MOCK_LAST_USER_KEY, created.id); } catch { /* Session cookie remains authoritative. */ }
    delete tickets[request.signupTicket];
    saveTickets(tickets);
    return authSignupResponseSchema.parse({ user: toAuthUser(created) });
  },
  async listSessions() {
    await delay();
    const userId = requireMockSession();
    return authSessionSchema.array().parse(mockSessionsByUser.get(userId) ?? []);
  },
  async revokeSession(id) {
    await delay();
    const userId = requireMockSession();
    const sessions = mockSessionsByUser.get(userId) ?? [];
    const session = sessions.find((entry) => entry.id === id);
    if (!session) {
      throw new ClientApiError({ code: "not_found", message: "Session not found" });
    }
    mockSessionsByUser.set(userId, sessions.filter((entry) => entry.id !== id));
    if (session.current) {
      mockAuthenticatedUserId = null;
      if (typeof window !== "undefined") await clearSession();
    }
  },
  async logout() {
    await delay();
    const userId = requireMockSession();
    mockSessionsByUser.set(userId, (mockSessionsByUser.get(userId) ?? []).filter((session) => !session.current));
    mockAuthenticatedUserId = null;
    if (typeof window !== "undefined") await clearSession();
  },
  async logoutAll() {
    await delay();
    const userId = requireMockSession();
    mockSessionsByUser.set(userId, []);
    mockAuthenticatedUserId = null;
    if (typeof window !== "undefined") await clearSession();
  },
  async usernameAvailable(username) {
    await delay(180);
    const normalized = username.replace(/^#/, "").toLowerCase();
    usernameAvailableQuerySchema.parse({ u: normalized });
    return usernameAvailableResponseSchema.parse({ available: !reservedTaken.has(normalized) && !reservedTaken.has(`#${normalized}`) && !mockAccounts.some((account) => account.user.username.toLowerCase() === normalized) });
  },
  async listSchools(query) {
    await delay(100);
    const search = query?.trim();
    if (!search || search.length < 2) return [];
    const { q } = schoolSearchQuerySchema.parse({ q: search });
    const normalized = q.toLowerCase();
    return schools
      .filter((school) =>
        school.name.toLowerCase().includes(normalized) ||
        school.id.toLowerCase().includes(normalized) ||
        (schoolAliases[school.id] ?? []).some((alias) => alias.toLowerCase().includes(normalized)),
      )
      .map((school) => schoolSchema.parse(school));
  },
  async me() {
    await delay(100);
    const userId = requireMockSession();
    const authenticatedUser = mockAccounts.find(account => account.user.id === userId);
    if (!authenticatedUser) throw new ClientApiError({ code: "unauthenticated", message: "Sign in to continue" });
    currentUser = toPublicUser(authenticatedUser.user);
    if (typeof window !== "undefined") {
      try {
        const activeId = window.localStorage.getItem(MOCK_LAST_USER_KEY);
        const active = mockAccounts.find((account) => account.user.id === activeId);
        if (active) currentUser = toPublicUser(active.user);
      } catch { /* Keep the current in-memory user. */ }
    }
    return toPublicUser(currentUser);
  },
  async updateMe(data) {
    await delay(120);
    const userId = requireMockSession();
    if (userId !== currentUser.id) throw new ClientApiError({ code: "unauthenticated", message: "Sign in to continue" });
    currentUser = userSchema.parse({ ...toPublicUser(currentUser), ...data });
    return currentUser;
  },

  // PROPOSED: not in backend doc
  async createCommunity(data) {
    await delay(220);
    const id = `c_${Date.now()}`;
    const slug = (data.name || "new").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const c: Community = { id, slug, name: data.name || "New community", blurb: data.blurb || "", memberCount: 1, category: data.category || "Web2", categories: [data.category || "Web2"], schoolName: data.schoolName || currentUser.schoolName || "FUT Minna", avatar: (data.name || "NC").slice(0, 2).toUpperCase(), bannerUrl: data.bannerUrl, joined: true, role: "owner", isPublic: true, onlineCount: 1 };
    communitiesState.push(c);
    memberships[id] = [{ userId: currentUser.id, role: "owner" }];
    DEFAULT_ASSETS.forEach((entry, i) => assets.push(assetFromCatalog(id, entry, i)));
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
  async myCommunities() {
    await delay(80);
    const userId = requireMockSession();
    if (userId !== currentUser.id) throw new ClientApiError({ code: "unauthenticated", message: "Sign in to continue" });
    return communitiesState
      .filter(c => roleIn(c.id))
      .map(c => {
        const communityAssets = visibleAssets(c.id);
        return {
          ...withCommunityState(c),
          unreadCount: communityAssets.reduce((sum, asset) => sum + (asset.unreadCount || 0), 0),
          mentions: communityAssets.reduce((sum, asset) => sum + (asset.mentions || 0), 0),
        };
      });
  },
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
  async listCommunityAssets(communitySlug) {
    await delay(80);
    const c = communityById(communitySlug);
    if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" });
    return groupedAssets(c.id);
  },
  // PROPOSED: not in backend doc
  async addAsset(communityId, catalogKey) {
    await delay(140);
    const c = communityById(communityId); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" });
    if (!canManageAssets(c.id)) throw new ClientApiError({ code: "FORBIDDEN", message: "Only community owners and moderators can add assets" });
    const entry = [...DEFAULT_ASSETS, ...ASSET_CATALOG].find(a => a.key === catalogKey);
    if (!entry || entry.isDefault) throw new ClientApiError({ code: "NOT_FOUND", message: "Unknown asset" });
    if (assets.some(a => a.communityId === c.id && a.catalogKey === catalogKey)) throw new ClientApiError({ code: "CONFLICT", message: "Asset already exists" });
    const a: Asset = { ...assetFromCatalog(c.id, entry, allCommunityAssets(c.id).length), id: `${c.id}-${entry.key}-${Date.now()}` };
    assets.push(a);
    return a;
  },
  // PROPOSED: not in backend doc
  async reorderCommunityAssets(communitySlug, assetIds) {
    await delay(80);
    const c = communityById(communitySlug); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Community not found" });
    if (!canManageAssets(c.id)) throw new ClientApiError({ code: "FORBIDDEN", message: "Only community owners and moderators can reorder assets" });
    const current = allCommunityAssets(c.id);
    const ids = new Set(assetIds);
    if (ids.size !== current.length || current.some(asset => !ids.has(asset.id))) throw new ClientApiError({ code: "VALIDATION_FAILED", message: "Asset order must include every asset exactly once" });
    const defaultIds = DEFAULT_ASSETS.map(entry => current.find(asset => asset.catalogKey === entry.key)!.id);
    if (assetIds.filter(id => defaultIds.includes(id)).join("|") !== defaultIds.join("|")) throw new ClientApiError({ code: "VALIDATION_FAILED", message: "Default assets cannot be reordered" });
    assets = assets.map(asset => {
      const order = asset.communityId === c.id ? assetIds.indexOf(asset.id) : -1;
      return order < 0 ? asset : { ...asset, order };
    });
    return groupedAssets(c.id);
  },
  // PROPOSED: not in backend doc
  async deleteAsset(assetId) {
    await delay(120);
    const a = assetById(assetId); if (!a) throw new ClientApiError({ code: "NOT_FOUND", message: "Asset not found" });
    if (a.isDefault) throw new ClientApiError({ code: "FORBIDDEN", message: "Default assets cannot be deleted" });
    if (!canManageAssets(a.communityId)) throw new ClientApiError({ code: "FORBIDDEN", message: "Only community owners and moderators can remove assets" });
    assets = assets.filter(x => x.id !== a.id);
    posts = posts.filter(p => p.assetId !== a.id);
    items = items.filter(item => item.assetId !== a.id);
    projects = projects.filter(project => project.assetId !== a.id);
    campaignState = campaignState.filter(campaign => campaign.assetId !== a.id);
    return { ok: true };
  },
  // PROPOSED: not in backend doc
  async updateAssetPermissions(assetId, permissions) {
    await delay(120);
    const a = assetById(assetId); if (!a) throw new ClientApiError({ code: "NOT_FOUND", message: "Asset not found" });
    if (roleIn(a.communityId) !== "owner") throw new ClientApiError({ code: "FORBIDDEN", message: "Only community owners can edit asset permissions" });
    assets = assets.map(asset => asset.id === assetId ? { ...asset, permissions } : asset);
    return { ...a, permissions };
  },
  // PROPOSED: not in backend doc
  async markAssetRead(assetId) {
    await delay(60);
    assets = assets.map(a => a.id === assetId ? { ...a, unreadCount: 0, lastReadPostId: posts.filter(p => p.assetId === assetId).at(-1)?.id || null } : a);
    return { ok: true };
  },

  // PROPOSED: not in backend doc
  async listMentions(scope, roomId) {
    await delay(60);
    if (scope === "asset" && !assetById(roomId)) throw new ClientApiError({ code: "NOT_FOUND", message: "Asset not found" });
    if (scope === "dm" && !conversationsState.some(conversation => conversation.id === roomId)) throw new ClientApiError({ code: "NOT_FOUND", message: "Conversation not found" });
    return unseenMentions(scope, roomId).map(({ messageId, seq, createdAt }) => mentionRecordSchema.parse({ messageId, seq, createdAt }));
  },
  // PROPOSED: not in backend doc
  async markMentionsSeen(scope, roomId, data) {
    const request = mentionSeenRequestSchema.parse(data);
    await delay(40);
    const ids = "all" in request ? unseenMentions(scope, roomId).map(mention => mention.messageId) : request.messageIds;
    for (const mention of mockMentions) {
      if (mention.scope === scope && mention.roomId === roomId && mention.userId === currentUser.id && ids.includes(mention.messageId)) {
        seenMockMentions.add(mentionKey(scope, roomId, mention.messageId, mention.userId));
      }
    }
    return apiOkResponseSchema.parse({ ok: true });
  },
  // PROPOSED: not in backend doc
  async mentionableMembers(scope, roomId, params) {
    const query = mentionableQuerySchema.parse(params || {});
    await delay(80);
    const candidates = mentionableCandidates(scope, roomId);
    const normalizedQuery = (query.q || "").replace(/^#/, "").trim().toLowerCase();
    const candidateRank = new Map(candidates.map((member, index) => [member.id, index]));
    const ranked = candidates
      .filter(member => member.id !== currentUser.id)
      .filter(member => !blocked.some(entry => entry.id === member.id || entry.username === member.username))
      .filter(member => !normalizedQuery || member.username.toLowerCase().includes(normalizedQuery))
      .map(member => ({ member, prefix: !normalizedQuery || member.username.toLowerCase().startsWith(normalizedQuery) }))
      .sort((a, b) => Number(b.prefix) - Number(a.prefix) || (
        normalizedQuery
          ? a.member.username.localeCompare(b.member.username)
          : (candidateRank.get(a.member.id) ?? 0) - (candidateRank.get(b.member.id) ?? 0)
      ));
    const offset = Math.max(0, Number.parseInt(query.cursor || "0", 10) || 0);
    const limit = query.limit || 20;
    const page = ranked.slice(offset, offset + limit).map(entry => entry.member);
    return mentionableMembersPageSchema.parse({ items: page, nextCursor: offset + page.length < ranked.length ? String(offset + page.length) : null });
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
    const taggedIds = resolveMentionIds("asset", assetId, data.content);
    if (taggedIds.length) {
      p.mentionedUserIds = taggedIds;
      recordMentions("asset", assetId, p.id, p.createdAt, taggedIds);
    }
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
  async listConversations() { await delay(100); return conversationsState.map(summarizeConversation).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")); },
  // PROPOSED: not in backend doc
  async getOrCreateConversation(username) {
    await delay(120);
    const existing = conversationsState.find(c => c.participant.username === username);
    if (existing) return summarizeConversation(existing);
    const u = users.find(x => x.username === username) || { id: username, username, presence: "offline" as const };
    const conv: Conversation = { id: `dm_${Date.now()}`, participant: { id: u.id, username: u.username }, otherUserId: u.id, unreadCount: 0, blocked: blocked.some(b => b.username === username), presence: u.presence === "hidden" ? "offline" : u.presence };
    conversationsState = [conv, ...conversationsState];
    return summarizeConversation(conv);
  },
  // PROPOSED: not in backend doc
  async getConversation(id) { await delay(80); const c = conversationsState.find(x => x.id === id); if (!c) throw new ClientApiError({ code: "NOT_FOUND", message: "Conversation not found" }); return summarizeConversation(c); },
  // PROPOSED: not in backend doc
  async listMessages(conversationId, opts) { await delay(100); const out = afterFilter(dms.filter(m => m.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)), opts?.after); return paginate(out); },
  // PROPOSED: not in backend doc
  async sendMessage(conversationId, text, opts) {
    await delay(120);
    const conv = conversationsState.find(c => c.id === conversationId);
    if (conv?.blocked) throw new ClientApiError({ code: "BLOCKED", message: "Blocked" });
    const m: DirectMessage = { id: `m_${Date.now()}`, conversationId, senderId: currentUser.id, text, createdAt: new Date().toISOString(), status: "sent", replyToId: opts?.replyToId, replyPreview: opts?.replyPreview };
    const taggedIds = resolveMentionIds("dm", conversationId, text);
    if (taggedIds.length) {
      m.mentionedUserIds = taggedIds;
      recordMentions("dm", conversationId, m.id, m.createdAt, taggedIds);
    }
    dms.push(m);
    conversationsState = conversationsState.map(c => c.id === conversationId ? { ...c, lastMessage: text, lastMessagePreview: text, lastMessageAt: m.createdAt } : c);
    return m;
  },
  // PROPOSED: not in backend doc
  async deleteMessage(conversationId, messageId) { await delay(80); dms = dms.map(m => m.id === messageId && m.conversationId === conversationId ? { ...m, deleted: true, text: "", reactions: [] } : m); return { ok: true }; },
  // PROPOSED: not in backend doc
  async setMessageReaction(scope, roomId, messageId, emoji, add, clientId) {
    const request = reactionRequestSchema.parse({ scope, roomId, messageId, emoji, add, clientId });
    await delay(70);
    if (!isAllowedReactionEmoji(request.emoji)) throw new ClientApiError({ code: "EMOJI_NOT_ALLOWED", message: "This emoji is not allowed" });
    const message = getReactionMessage(request.scope, request.roomId, request.messageId);
    if (!message || message.deleted) throw new ClientApiError({ code: "NOT_FOUND", message: "Message not found" });
    if (request.scope === "asset") {
      const asset = assetById(request.roomId);
      const role = asset ? roleIn(asset.communityId) : null;
      if (!asset || !canRead(asset, role) || !canPost(asset, role)) {
        throw new ClientApiError({ code: "ASSET_FORBIDDEN", message: "You cannot react in this asset" });
      }
    } else {
      const conversation = conversationsState.find(item => item.id === request.roomId);
      const blockedPeer = conversation && blocked.some(user => user.username === conversation.participant.username);
      if (!conversation || conversation.blocked || blockedPeer) {
        throw new ClientApiError({ code: "DM_BLOCKED", message: "You can't message this user" });
      }
    }

    const currentReactions = message.reactions || [];
    const existing = currentReactions.find(reaction => reaction.emoji === request.emoji);
    const mineCount = currentReactions.filter(reaction => reaction.me).length;
    if (request.add) {
      if (existing?.me) return apiOkResponseSchema.parse({ ok: true });
      if (mineCount >= MAX_REACTIONS_PER_USER_PER_MESSAGE || (!existing && currentReactions.length >= MAX_DISTINCT_REACTIONS_PER_MESSAGE)) {
        throw new ClientApiError({ code: "REACTION_LIMIT_REACHED", message: "Reaction limit reached" });
      }
      message.reactions = addReactionSummary(currentReactions, request.emoji, currentUser.id, currentUser.id);
    } else {
      message.reactions = removeReactionSummary(currentReactions, request.emoji);
    }
    return apiOkResponseSchema.parse({ ok: true });
  },
  // PROPOSED: not in backend doc
  async listReactionUsers(scope, roomId, messageId, emoji, cursor) {
    const request = reactionPathSchema.parse({ scope, roomId, messageId, emoji });
    const query = reactionUsersQuerySchema.parse({ cursor });
    await delay(50);
    const message = getReactionMessage(request.scope, request.roomId, request.messageId);
    if (!message || message.deleted) throw new ClientApiError({ code: "NOT_FOUND", message: "Message not found" });
    const summary = message.reactions?.find(reaction => reaction.emoji === request.emoji);
    if (!summary) return reactionUsersPageSchema.parse(paginate([]));
    const candidates: ReactionUser[] = [];
    if (summary.me) candidates.push({ id: currentUser.id, username: currentUser.username, avatarUrl: currentUser.avatarUrl, me: true });
    const otherCount = Math.max(0, summary.count - Number(summary.me));
    const visibleUsers = users.filter(user => user.id !== currentUser.id && !blocked.some(block => block.id === user.id));
    for (let index = 0; index < otherCount; index += 1) {
      const user = visibleUsers[index];
      candidates.push(user
        ? { id: user.id, username: user.username, avatarUrl: user.avatarUrl, me: false }
        : { id: `mock-user-${index}`, username: `member-${index + 1}`, me: false });
    }
    const offset = Math.max(0, Number(query.cursor || 0) || 0);
    const page = candidates.slice(offset, offset + 20);
    return reactionUsersPageSchema.parse(paginate(page, offset + page.length < candidates.length ? String(offset + page.length) : null));
  },
  // PROPOSED: not in backend doc
  subscribeReactionEvents(scope, roomId, listener) {
    const key = reactionRoomKey(scope, roomId);
    let subscription = reactionListeners.get(key);
    if (!subscription) {
      const created = {
        listeners: new Set<(event: ReactionUpdatedEvent) => void>(),
        tick: 0,
        timer: undefined as ReturnType<typeof setInterval> | undefined,
      };
      subscription = created;
      reactionListeners.set(key, subscription);
    }
    subscription.listeners.add(listener);
    return () => {
      const active = reactionListeners.get(key);
      if (!active) return;
      active.listeners.delete(listener);
      if (active.listeners.size === 0) {
        clearInterval(active.timer);
        reactionListeners.delete(key);
      }
    };
  },
  // PROPOSED: not in backend doc
  async markRead(conversationId) { await delay(60); conversationsState = conversationsState.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c); dms = dms.map(m => m.conversationId === conversationId && m.senderId !== currentUser.id ? { ...m, status: "seen" } : m); return { ok: true }; },
  // PROPOSED: not in backend doc
  async unreadCount() {
    await delay(50);
    const userId = requireMockSession();
    if (userId !== currentUser.id) throw new ClientApiError({ code: "unauthenticated", message: "Sign in to continue" });
    const assetSummaries = assets.filter(asset => roleIn(asset.communityId) && canRead(asset, roleIn(asset.communityId))).map(summarizeAsset);
    const dmSummaries = conversationsState.map(summarizeConversation);
    return unreadCountsSchema.parse({
      unread: assetSummaries.reduce((total, asset) => total + (asset.unreadCount || 0), 0) + dmSummaries.reduce((total, conversation) => total + conversation.unreadCount, 0),
      mentions: assetSummaries.reduce((total, asset) => total + (asset.mentions || 0), 0) + dmSummaries.reduce((total, conversation) => total + (conversation.mentions || 0), 0),
    });
  },

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
});

void ASSET_CATEGORY_ORDER;
