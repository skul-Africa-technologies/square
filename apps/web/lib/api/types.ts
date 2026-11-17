import type {
  AuthRequestCodeResponse, AuthSignupRequest, AuthSignupResponse, AuthVerifyCodeResponse,
  Badge, BlockedUser, Campaign, Channel, Community, Conversation, DirectMessage, Paginated, Post, Project, School, Tab, User
} from "@square/shared";

export interface UploadSignRequest { kind: "avatar" | "banner" | "post-media" }
export interface UploadSignResponse { signature: string; timestamp: number; cloudName: string; apiKey: string; folder: string; uploadPreset?: string }

export interface ApiClient {
  requestCode(email: string): Promise<AuthRequestCodeResponse & { retryAfter?: number }>;
  verifyCode(email: string, code: string): Promise<AuthVerifyCodeResponse & { retryAfter?: number }>;
  signup(data: AuthSignupRequest): Promise<AuthSignupResponse>;
  usernameAvailable(username: string): Promise<{ available: boolean }>;
  listSchools(query?: string): Promise<School[]>;
  me(): Promise<User>;
  updateMe(data: Partial<User>): Promise<User>;
  createCommunity(data: Partial<Community>): Promise<Community>;
  getCommunity(id: string): Promise<Community>;
  createChannel(communityId: string, data: Partial<Channel>): Promise<Channel>;
  getChannelTabs(channelId: string): Promise<Tab[]>;
  createTab(channelId: string, data: Partial<Tab>): Promise<Tab>;
  updateTabPermissions(tabId: string, permissions: Tab["permissions"]): Promise<Tab>;
  listPosts(tabId: string, opts?: { cursor?: string; after?: string }): Promise<Paginated<Post>>;
  createPost(tabId: string, data: { content: string; media?: Post["media"] }): Promise<Post>;
  signUpload(data: UploadSignRequest): Promise<UploadSignResponse>;

  // PROPOSED: not in backend doc
  listCommunities(params?: { filter?: string; q?: string }): Promise<Paginated<Community>>;
  // PROPOSED: not in backend doc
  listChannels(communityId?: string, params?: { filter?: string; q?: string; joined?: boolean }): Promise<Channel[]>;
  // PROPOSED: not in backend doc
  joinChannel(channelId: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  leaveChannel(channelId: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  myChannels(): Promise<Channel[]>;
  // PROPOSED: not in backend doc
  homeFeed(opts?: { after?: string }): Promise<Paginated<Post>>;

  // PROPOSED: not in backend doc
  listProjects(tabId: string): Promise<Project[]>;
  // PROPOSED: not in backend doc
  getProject(id: string): Promise<Project>;
  // PROPOSED: not in backend doc
  createProject(tabId: string, data: Partial<Project>): Promise<Project>;
  // PROPOSED: not in backend doc
  listCampaigns(channelId: string): Promise<Campaign[]>;
  // PROPOSED: not in backend doc
  getCampaign(id: string): Promise<Campaign>;
  // PROPOSED: not in backend doc
  joinCampaign(id: string): Promise<Campaign>;
  // PROPOSED: not in backend doc
  completeCampaignTask(campaignId: string, taskId: string): Promise<Campaign>;
  // PROPOSED: not in backend doc
  listBadges(): Promise<Badge[]>;
  // PROPOSED: not in backend doc
  getProfile(username: string): Promise<User & { projects: Project[]; campaigns: Campaign[]; badges: Badge[]; channelsJoined: number; joinedChannels: Channel[] }>;

  // PROPOSED: not in backend doc
  listConversations(): Promise<Conversation[]>;
  // PROPOSED: not in backend doc
  getOrCreateConversation(username: string): Promise<Conversation>;
  // PROPOSED: not in backend doc
  getConversation(id: string): Promise<Conversation>;
  // PROPOSED: not in backend doc
  listMessages(conversationId: string, opts?: { after?: string }): Promise<Paginated<DirectMessage>>;
  // PROPOSED: not in backend doc
  sendMessage(conversationId: string, text: string): Promise<DirectMessage>;
  // PROPOSED: not in backend doc
  deleteMessage(conversationId: string, messageId: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  markRead(conversationId: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  unreadCount(): Promise<{ count: number }>;

  // PROPOSED: not in backend doc
  blockUser(username: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  unblockUser(username: string): Promise<{ ok: true }>;
  // PROPOSED: not in backend doc
  listBlocked(): Promise<BlockedUser[]>;
  // PROPOSED: not in backend doc
  reportUser(username: string, reason: string, note?: string): Promise<{ ok: true }>;
}
