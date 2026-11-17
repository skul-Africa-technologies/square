export type Role = "owner" | "moderator" | "member";
export type TabKind = "chat" | "feed" | "board" | "list" | "form";

export interface School { id: string; name: string }
export interface User {
  id: string;
  username: string; // stored without #
  displayName?: string;
  schoolId?: string;
  schoolName?: string;
  dob?: string; // private, never shown publicly
  avatarUrl?: string;
  verifiedStudent: boolean;
  joinedAt: string;
  bio?: string;
  skills?: string[];
  badgeIds?: string[];
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
}

export interface Channel {
  id: string;
  communityId: string;
  name: string;
  slug: string;
  description?: string;
}

export interface TabPermissions {
  canPost: Role[];
  canPin: Role[];
  canRemove: Role[];
}

export interface Tab {
  id: string;
  channelId: string;
  name: string;
  slug: string;
  kind: TabKind;
  fixed?: "general" | "community";
  template?: "announcements" | "campaigns" | "hackathons" | "support" | "projects";
  enabled: boolean;
  permissions: TabPermissions;
  order: number;
}

export interface Post {
  id: string;
  tabId: string;
  authorId: string;
  content: string;
  createdAt: string;
  pinned?: boolean;
  media?: { id: string; url: string; type: "image" | "video" }[];
}

export interface Project {
  id: string;
  channelId: string;
  tabId: string;
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

export interface Campaign {
  id: string;
  channelId: string;
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

export interface Badge { id: string; name: string; icon?: string }

export interface ApiError { code: string; message: string; field?: string }
export interface Paginated<T> { items: T[]; nextCursor?: string | null }

export interface AuthRequestCodeResponse { ok: true }
export interface AuthVerifyCodeResponse { hasAccount: boolean; token?: string }
export interface AuthSignupRequest { emailToken: string; username: string; schoolId: string; dob: string }
export interface AuthSignupResponse { token: string }
