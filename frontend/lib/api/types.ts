import type {
  Asset, AssetCatalogEntry, AssetCategoryGroup, AssetItem, AssetPermissions, Activity, AuthRequestCodeResponse, AuthSignupRequest, AuthSignupResponse, AuthVerifyCodeResponse,
  AuthSession, Badge, BlockedUser, Campaign, Community, CommunityDetail, CommunityMembers, Conversation, DirectMessage, DiscoverResponse, ExploreCommunity, MentionRecord, MentionScope, MentionableMember,
  Paginated, Post, PresenceStatus, Project, ReactionScope, ReactionStreamEvent, ReactionSummary, ReactionUser, ReplyPreview, School,
  SearchResults, SearchSuggested, User,
  PublicRank, MeRank, RankHistoryItem, RankActivityItem, RankRequirements, RankSeen
} from "@square/shared";

export interface UploadSignRequest { kind: "avatar" | "banner" | "post-media" }
export interface UploadSignResponse { signature: string; timestamp: number; cloudName: string; apiKey: string; folder: string; uploadPreset?: string }

// PROPOSED: not in backend doc
export interface Profile extends User {
  projects: Project[];
  campaigns: Campaign[];
  badges: Badge[];
  communitiesJoined: number;
  joinedCommunities: Community[];
  relations?: { blocked: boolean; blockedBy: boolean; inCommonCount: number };
  // PROPOSED: not in backend doc
  stats?: { communities: number; badges: number; projects: number };
  // PROPOSED: not in backend doc
  badgePins?: string[];
  // PROPOSED: not in backend doc
  featuredProjectId?: string;
  // PROPOSED: not in backend doc
  mutualAvatars?: { id: string; username: string; avatarUrl?: string }[];
  // PROPOSED: not in backend doc
  presence?: PresenceStatus;
}

export interface ApiClient {
  requestCode(email: string): Promise<AuthRequestCodeResponse & { retryAfter?: number }>;
  verifyCode(email: string, code: string): Promise<AuthVerifyCodeResponse & { retryAfter?: number }>;
  signup(data: AuthSignupRequest): Promise<AuthSignupResponse>;
  listSessions(): Promise<AuthSession[]>;
  revokeSession(id: string): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  usernameAvailable(username: string): Promise<{ available: boolean }>;
  listSchools(query?: string): Promise<School[]>;
  me(): Promise<User>;
  updateMe(data: Partial<User>): Promise<User>;

  // PROPOSED: not in backend doc
  createCommunity(data: Partial<Community>): Promise<Community>;
  // PROPOSED: not in backend doc
  getCommunity(id: string): Promise<CommunityDetail>;
  // PROPOSED: not in backend doc
  joinCommunity(id: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  leaveCommunity(id: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  listCommunityMembers(id: string): Promise<CommunityMembers>;
  // PROPOSED: not in backend doc
  myCommunities(): Promise<Community[]>;
  // PROPOSED: not in backend doc
  exploreCommunities(params?: { q?: string; category?: string; sort?: "top" | "new"; school?: string; cursor?: string }): Promise<Paginated<ExploreCommunity>>;

  // PROPOSED: not in backend doc
  getAssetCatalog(): Promise<AssetCatalogEntry[]>;
  // PROPOSED: not in backend doc
  listCommunityAssets(communitySlug: string): Promise<AssetCategoryGroup[]>;
  // PROPOSED: not in backend doc
  addAsset(communityId: string, catalogKey: string): Promise<Asset>;
  // PROPOSED: not in backend doc
  reorderCommunityAssets(communitySlug: string, assetIds: string[]): Promise<AssetCategoryGroup[]>;
  // PROPOSED: not in backend doc
  deleteAsset(assetId: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  updateAssetPermissions(assetId: string, permissions: AssetPermissions): Promise<Asset>;
  // PROPOSED: not in backend doc
  markAssetRead(assetId: string): Promise<{ ok: true }>;

  // PROPOSED: not in backend doc
  listPosts(assetId: string, opts?: { cursor?: string; after?: string }): Promise<Paginated<Post>>;
  // PROPOSED: not in backend doc (reply fields)
  createPost(assetId: string, data: { content: string; media?: Post["media"]; replyToId?: string; replyPreview?: ReplyPreview }): Promise<Post>;
  // PROPOSED: not in backend doc
  listItems(assetId: string): Promise<AssetItem[]>;
  // PROPOSED: not in backend doc
  createItem(assetId: string, data: Partial<AssetItem>): Promise<AssetItem>;
  // PROPOSED: not in backend doc
  deleteItem(assetId: string, itemId: string): Promise<{ ok: true }>;
  signUpload(data: UploadSignRequest): Promise<UploadSignResponse>;

  // PROPOSED: not in backend doc
  homeFeed(opts?: { after?: string }): Promise<Paginated<Post>>;

  // PROPOSED: not in backend doc
  listProjects(assetId: string): Promise<Project[]>;
  // PROPOSED: not in backend doc
  getProject(id: string): Promise<Project>;
  // PROPOSED: not in backend doc
  createProject(assetId: string, data: Partial<Project>): Promise<Project>;
  // PROPOSED: not in backend doc
  listCampaigns(assetId: string): Promise<Campaign[]>;
  // PROPOSED: not in backend doc
  getCampaign(id: string): Promise<Campaign>;
  // PROPOSED: not in backend doc
  joinCampaign(id: string): Promise<Campaign>;
  // PROPOSED: not in backend doc
  completeCampaignTask(campaignId: string, taskId: string): Promise<Campaign>;
  // PROPOSED: not in backend doc
  listBadges(): Promise<Badge[]>;
  // PROPOSED: not in backend doc
  getProfile(username: string): Promise<Profile>;
  // PROPOSED: not in backend doc
  getProfileProjects(username: string): Promise<Project[]>;
  // PROPOSED: not in backend doc
  getProfileActivity(username: string): Promise<Activity[]>;
  // PROPOSED: not in backend doc
  getProfileBadges(username: string): Promise<Badge[]>;
  // PROPOSED: not in backend doc
  sharedCommunities(username: string): Promise<Community[]>;

  getPublicRank(username: string): Promise<PublicRank>;
  getMyRank(): Promise<MeRank>;
  getMyRankHistory(): Promise<{ history: RankHistoryItem[] }>;
  getMyRankActivity(): Promise<{ activity: RankActivityItem[] }>;
  getMyRankRequirements(): Promise<RankRequirements>;
  markRankSeen(): Promise<RankSeen>;

  // PROPOSED: not in backend doc
  listConversations(): Promise<Conversation[]>;
  // PROPOSED: not in backend doc
  getOrCreateConversation(username: string): Promise<Conversation>;
  // PROPOSED: not in backend doc
  getConversation(id: string): Promise<Conversation>;
  // PROPOSED: not in backend doc
  listMessages(conversationId: string, opts?: { after?: string }): Promise<Paginated<DirectMessage>>;
  // PROPOSED: not in backend doc (reply fields)
  sendMessage(conversationId: string, text: string, opts?: { replyToId?: string; replyPreview?: ReplyPreview }): Promise<DirectMessage>;
  // PROPOSED: not in backend doc
  deleteMessage(conversationId: string, messageId: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  setMessageReaction(scope: ReactionScope, roomId: string, messageId: string, emoji: string, add: boolean, clientId: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  listReactionUsers(scope: ReactionScope, roomId: string, messageId: string, emoji: string, cursor?: string): Promise<Paginated<ReactionUser>>;
  // PROPOSED: not in backend doc
  subscribeReactionEvents(scope: ReactionScope, roomId: string, listener: (event: ReactionStreamEvent) => void): () => void;
  // PROPOSED: not in backend doc
  listMentions(scope: MentionScope, roomId: string): Promise<MentionRecord[]>;
  // PROPOSED: not in backend doc
  markMentionsSeen(scope: MentionScope, roomId: string, data: { messageIds?: string[]; all?: true }, options?: { keepalive?: boolean }): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  mentionableMembers(scope: MentionScope, roomId: string, params?: { q?: string; cursor?: string; limit?: number }): Promise<Paginated<MentionableMember>>;
  // PROPOSED: not in backend doc
  markRead(conversationId: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  unreadCount(): Promise<{ unread: number; mentions: number }>;

  // PROPOSED: not in backend doc
  blockUser(username: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  unblockUser(username: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  listBlocked(): Promise<BlockedUser[]>;
  // PROPOSED: not in backend doc
  reportUser(username: string, reason: string, note?: string): Promise<{ ok: true }>;

  // PROPOSED: not in backend doc
  search(q: string): Promise<SearchResults>;
  // PROPOSED: not in backend doc
  searchSuggested(): Promise<SearchSuggested>;
  // PROPOSED: not in backend doc
  getPresence(ids: string[]): Promise<Record<string, PresenceStatus>>;
  // PROPOSED: not in backend doc
  setPresence(mode: "online" | "offline"): Promise<{ presence: PresenceStatus }>;
  // PROPOSED: not in backend doc
  recentDms(limit?: number): Promise<Conversation[]>;
  // PROPOSED: not in backend doc
  setConversationMuted(conversationId: string, muted: boolean): Promise<Conversation>;
  // PROPOSED: not in backend doc
  hideConversation(conversationId: string): Promise<{ ok: true }>;

  // PROPOSED: not in backend doc
  discover(): Promise<DiscoverResponse>;
  // PROPOSED: not in backend doc
  dismissPerson(id: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  updatePrivacy(data: { showBirthday: boolean }): Promise<{ ok: true }>;
}
