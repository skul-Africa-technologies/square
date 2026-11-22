export type Role = "owner" | "moderator" | "member";
export type AssetKind = "chat" | "feed" | "board" | "list" | "form";
export type AssetCategory = "Information" | "Community" | "Resources" | "Build";
export type PresenceStatus = "online" | "offline" | "hidden";

export interface School { id: string; name: string }
export interface User {
  id: string;
  username: string; // stored without #
  displayName?: string;
  schoolId?: string;
  schoolName?: string;
  dob?: string; // private, never shown publicly
  avatarUrl?: string;
  bannerUrl?: string;
  verifiedStudent: boolean;
  joinedAt: string;
  bio?: string;
  skills?: string[]; // interest chips
  badgeIds?: string[];
  presence?: PresenceStatus;
  // PROPOSED: not in backend doc
  birthdayToday?: boolean;
  // PROPOSED: not in backend doc
  showBirthday?: boolean;
  // PROPOSED: not in backend doc
  joinedCommunitySlugs?: string[];
  // PROPOSED: not in backend doc
  status?: string;
  // PROPOSED: not in backend doc
  department?: string;
  // PROPOSED: not in backend doc
  level?: string;
  // PROPOSED: not in backend doc
  links?: { label: string; url: string }[];
  // PROPOSED: not in backend doc
  location?: string;
  // PROPOSED: not in backend doc
  languages?: string[];
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  blurb: string;
  memberCount: number;
  category: string;
  schoolName?: string;
  avatar?: string;
  bannerUrl?: string;
  categories?: string[];
  onlineCount?: number;
  joined?: boolean;
  isPublic?: boolean;
  // PROPOSED: not in backend doc
  role?: Role | null;
  unreadCount?: number;
  // PROPOSED: not in backend doc
  mentions?: number;
}

export interface AssetPermissions {
  canRead: Role[];
  canPost: Role[];
  canPin: Role[];
}

export interface Asset {
  id: string;
  communityId: string;
  name: string;
  slug: string;
  description?: string;
  kind: AssetKind;
  category: AssetCategory;
  template?: string;
  permissions: AssetPermissions;
  isDefault?: boolean;
  catalogKey?: string;
  order: number;
  // PROPOSED: not in backend doc
  hiddenFromMembers?: boolean;
  // PROPOSED: not in backend doc
  locked?: boolean;
  // PROPOSED: not in backend doc
  unreadCount?: number;
  // PROPOSED: not in backend doc
  mentions?: number;
  // PROPOSED: not in backend doc
  lastReadPostId?: string | null;
}

// PROPOSED: not in backend doc
export interface AssetCatalogEntry {
  key: string;
  name: string;
  description: string;
  kind: AssetKind;
  category: AssetCategory;
  permissions: AssetPermissions;
  unique: boolean;
  isDefault?: boolean;
  hiddenFromMembers?: boolean;
}

export interface AssetCategoryGroup {
  category: AssetCategory;
  assets: Asset[];
}

// PROPOSED: not in backend doc
export interface CommunityMember {
  id: string;
  username: string;
  avatarUrl?: string;
  schoolName?: string;
  role: Role;
  presence?: PresenceStatus;
}

// PROPOSED: not in backend doc
export interface CommunityMembers {
  owners: CommunityMember[];
  moderators: CommunityMember[];
  online: CommunityMember[];
  offline: CommunityMember[];
}

// PROPOSED: not in backend doc
export interface CommunityDetail {
  community: Community;
  assets: Asset[];
}

// PROPOSED: not in backend doc
export interface ReplyPreview {
  id: string;
  authorUsername: string;
  authorAvatar?: string;
  snippet: string;
  deleted?: boolean;
}

export type ReactionScope = "asset" | "dm";
export type MentionScope = "asset" | "dm";
export interface MentionRecord { messageId: string; seq: number; createdAt: string }
export interface MentionableMember {
  id: string;
  username: string;
  avatarUrl?: string;
  schoolName?: string;
  role?: Role;
  presence?: PresenceStatus;
}
export interface ReactionSummary { emoji: string; count: number; me: boolean }
export interface ReactionUser { id: string; username: string; avatarUrl?: string; me: boolean }
export interface ReactionUpdatedEvent {
  type: "reaction.updated";
  scope: ReactionScope;
  roomId: string;
  messageId: string;
  emoji: string;
  count: number;
  op: "add" | "remove";
  userId: string;
  clientId?: string;
}
export interface ReactionResyncEvent {
  type: "reaction.resync";
  scope: ReactionScope;
  roomId: string;
  messages: Array<{ messageId: string; reactions: ReactionSummary[] }>;
}
export type ReactionStreamEvent = ReactionUpdatedEvent | ReactionResyncEvent;

export interface Post {
  id: string;
  assetId: string;
  authorId: string;
  authorUsername?: string;
  content: string;
  createdAt: string;
  pinned?: boolean;
  media?: { id: string; url: string; type: "image" | "video" }[];
  communityId?: string;
  communityName?: string;
  communitySlug?: string;
  assetName?: string;
  assetSlug?: string;
  // PROPOSED: not in backend doc
  replyToId?: string;
  // PROPOSED: not in backend doc
  replyPreview?: ReplyPreview;
  deleted?: boolean;
  reactions?: ReactionSummary[];
  mentionedUserIds?: string[];
}

// PROPOSED: not in backend doc
export interface AssetItem {
  id: string;
  assetId: string;
  title: string;
  description?: string;
  date?: string;
  place?: string;
  link?: string;
  pinned?: boolean;
  createdAt: string;
  createdBy?: string;
}

export interface Project {
  id: string;
  assetId: string;
  communityId?: string;
  title: string;
  status: "idea" | "building" | "launched";
  description: string;
  needs?: string[];
  teamCount: number;
  team: { id: string; username: string; avatarUrl?: string }[];
  milestones: { id: string; text: string; done: boolean }[];
  rolesNeeded: string[];
  updates: { id: string; text: string; createdAt: string }[];
  shippedRecord?: string;
}

export interface CampaignTask {
  id: string;
  title: string;
  points?: number;
  badgeReward?: string;
  done?: boolean;
}

// PROPOSED: not in backend doc
export interface Activity {
  id: string;
  type: "badge" | "community" | "project" | "campaign";
  actorUsername: string;
  text: string;
  createdAt: string;
  badge?: string;
  community?: string;
  project?: string;
  campaign?: string;
}

export interface Campaign {
  id: string;
  assetId: string;
  title: string;
  goal: string;
  endsAt: string;
  target: number;
  joined: number;
  tasks: CampaignTask[];
  leaderboard: { rank: number; userId: string; username: string; points: number }[];
  pinned?: boolean;
  status: "active" | "ended";
  resultsSummary?: string;
}

export interface Badge { id: string; name: string; icon?: string; earnedAt?: string; rarity?: "common" | "uncommon" | "rare" | "legendary" }

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  status?: "sending" | "sent" | "failed" | "seen";
  deleted?: boolean;
  // PROPOSED: not in backend doc
  replyToId?: string;
  // PROPOSED: not in backend doc
  replyPreview?: ReplyPreview;
  reactions?: ReactionSummary[];
  mentionedUserIds?: string[];
}

export interface Conversation {
  id: string;
  participant: { id: string; username: string; avatarUrl?: string };
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  blocked?: boolean;
  // PROPOSED: not in backend doc
  lastMessagePreview?: string;
  // PROPOSED: not in backend doc
  presence?: PresenceStatus;
  // PROPOSED: not in backend doc
  otherUserId?: string;
  // PROPOSED: not in backend doc
  muted?: boolean;
  // PROPOSED: not in backend doc
  mentions?: number;
}

// PROPOSED: not in backend doc
export type CommunityRelation = "none" | "member";
// PROPOSED: not in backend doc
export interface ExploreCommunity extends Community {
  relation: CommunityRelation;
}
// PROPOSED: not in backend doc
export type SearchResult =
  | { kind: "person"; id: string; username: string; schoolName?: string; sharedCommunities?: number; canMessage?: boolean; presence?: PresenceStatus; avatarUrl?: string }
  | { kind: "dm"; id: string; username: string; preview?: string; presence?: PresenceStatus; avatarUrl?: string }
  | { kind: "community"; id: string; name: string; slug: string; blurb?: string; memberCount?: number; category?: string; joined?: boolean; avatar?: string };
// PROPOSED: not in backend doc
export interface SearchResults { people: SearchResult[]; dms: SearchResult[]; communities: SearchResult[] }
// PROPOSED: not in backend doc
export interface SearchSuggested { people: SearchResult[]; communities: SearchResult[] }

export interface BlockedUser { id: string; username: string }

export interface ApiError { code: string; message: string; field?: string }
export interface Paginated<T> { items: T[]; nextCursor?: string | null }

export interface AuthRequestCodeResponse { ok: true; retryAfter?: number }
export interface AuthVerifyCodeResponse {
  isNewUser: boolean;
  user?: User;
  signupTicket?: string;
  retryAfter?: number;
}
export interface AuthSignupRequest { signupTicket: string; username: string; schoolId: string; dateOfBirth: string }
export interface AuthSignupResponse { user: User }

// PROPOSED: not in backend doc
export interface DiscoverSection {
  id: string;
  items: any[];
}

// PROPOSED: not in backend doc
export interface DiscoverResponse {
  sections: DiscoverSection[];
}

// PROPOSED: not in backend doc
export interface DiscoverCommunity {
  id: string;
  name: string;
  slug: string;
  blurb: string;
  memberCount: number;
  onlineCount?: number;
  category: string;
  bannerUrl?: string;
  avatar?: string;
  isPublic: boolean;
}

// PROPOSED: not in backend doc
export interface DiscoverPerson {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  schoolName?: string;
  sharedCommunities: number;
  sharedInterests: string[];
  interests: string[];
  canMessage: boolean;
}

// PROPOSED: not in backend doc
export interface DiscoverBirthday {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isCurrentUser?: boolean;
}

// PROPOSED: not in backend doc
export interface DiscoverEvent {
  id: string;
  title: string;
  communityName: string;
  communitySlug: string;
  date: string;
  time?: string;
  place?: string;
}

// PROPOSED: not in backend doc
export interface DiscoverStudent {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}
