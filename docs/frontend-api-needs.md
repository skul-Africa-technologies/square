# Frontend API Needs

This document lists every API endpoint the frontend calls, its request/response shape, and which screen uses it.

## Authentication

### `POST /api/auth/request-code`
**Screen:** Login
**Request:** `{ email: string }`
**Response:** `{ ok: true, retryAfter?: number }`

### `POST /api/auth/verify-code`
**Screen:** Login
**Request:** `{ email: string, code: string }`
**Response:** `{ hasAccount: boolean, token?: string, retryAfter?: number }`

### `POST /api/auth/signup`
**Screen:** Signup
**Request:** `{ emailToken: string, username: string, schoolId: string, dob: string }`
**Response:** `{ token: string }`

### `GET /api/auth/username-available?username=...`
**Screen:** Signup
**Response:** `{ available: boolean }`

### `GET /api/schools?q=...`
**Screen:** Signup
**Response:** `School[]`

## User

### `GET /api/me`
**Screen:** All (initial load), Settings, Profile
**Response:** `User`

### `PATCH /api/me`
**Screen:** Settings
**Request:** `Partial<User>`
**Response:** `User`

### `POST /api/upload/sign`
**Screen:** Settings (avatar), CreateCommunityModal (banner), Composer (post media)
**Request:** `{ kind: "avatar" | "banner" | "post-media" }`
**Response:** `{ signature: string, timestamp: number, cloudName: string, apiKey: string, folder: string, uploadPreset?: string }`

## Communities

### `POST /api/communities`
**Screen:** CreateCommunityModal
**Request:** `{ name: string, blurb?: string, category: string, bannerUrl?: string, schoolName?: string }`
**Response:** `Community` (with the four default assets created)

### `GET /api/communities/:id`
**Screen:** CommunityAssetView, AppSidebar, Explore (preview)
**Response:** `CommunityDetail` — `{ community: Community & { joined: boolean, role: Role | null }, assets: Asset[] }`
**Notes:** Assets are filtered by read permissions, sorted by order, include `locked` (cannot post) and `unreadCount`.

### `POST /api/communities/:id/join`
**Screen:** Explore (community card), CommunityAssetView (join bar), CommunitySidebar (join button)
**Response:** `{ ok: true }`

### `DELETE /api/communities/:id/join` (or `POST /api/communities/:id/leave`)
**Screen:** Community settings menu
**Response:** `{ ok: true }`

### `GET /api/communities/:id/members`
**Screen:** MemberList (right panel)
**Response:** `CommunityMembers` — `{ owners: CommunityMember[], moderators: CommunityMember[], online: CommunityMember[], offline: CommunityMember[] }`
**Notes:** Offline loads lazily on demand.

### `GET /api/my-communities`
**Screen:** CommunityStrip, AppSidebar (when not in a community), HomeHub
**Response:** `Community[]` — only communities the current user has joined, with `joined: true` and `role` set.

### `GET /api/explore/communities`
**Screen:** ExploreView
**Query:** `{ q?: string, category?: string, sort?: "top" | "new", cursor?: string }`
**Response:** `Paginated<ExploreCommunity>` — public communities only, with `relation: "member" | "none"` and `joined: boolean`.

## Assets

### `GET /api/asset-catalog`
**Screen:** AddAssetDialog
**Response:** `AssetCatalogEntry[]` — all default + optional catalog entries.

### `POST /api/communities/:id/assets`
**Screen:** AddAssetDialog
**Request:** `{ catalogKey: string }`
**Response:** `Asset` — the newly created asset instance.

### `DELETE /api/assets/:id`
**Screen:** Asset settings (owner only), AddAssetDialog (remove)
**Response:** `{ ok: true }`
**Notes:** Fails for default assets (`isDefault: true`).

### `PATCH /api/assets/:id/permissions`
**Screen:** Asset settings (owner only)
**Request:** `AssetPermissions` — `{ canRead: Role[], canPost: Role[], canPin: Role[] }`
**Response:** `Asset`

### `POST /api/assets/:id/read`
**Screen:** CommunityAssetView (unread banner "Mark as read")
**Response:** `{ ok: true }`
**Notes:** Sets `unreadCount = 0` and `lastReadPostId` to latest post.

## Posts (Chat & Feed Assets)

### `GET /api/assets/:id/posts`
**Screen:** CommunityAssetView (chat/feed)
**Query:** `{ cursor?: string, after?: string }`
**Response:** `Paginated<Post>` — sorted oldest first.

### `POST /api/assets/:id/posts`
**Screen:** CommunityAssetView (composer)
**Request:** `{ content: string, media?: Post["media"], replyToId?: string, replyPreview?: ReplyPreview }`
**Response:** `Post`

## Items (List & Form Assets)

### `GET /api/assets/:id/items`
**Screen:** CommunityAssetView (list)
**Response:** `AssetItem[]` — sorted by pinned desc, then createdAt desc.

### `POST /api/assets/:id/items`
**Screen:** CommunityAssetView (list composer)
**Request:** `Partial<AssetItem>` — `{ title, description?, date?, place?, link? }`
**Response:** `AssetItem`

### `DELETE /api/assets/:id/items/:itemId`
**Screen:** CommunityAssetView (list item menu)
**Response:** `{ ok: true }`

## Board Assets (Projects & Campaigns)

### `GET /api/assets/:id/projects`
**Screen:** CommunityAssetView (board - projects)
**Response:** `Project[]`

### `GET /api/projects/:id`
**Screen:** Project detail (future)
**Response:** `Project`

### `POST /api/assets/:id/projects`
**Screen:** CommunityAssetView (board composer)
**Request:** `{ title: string, description?: string, status?: "idea" | "building" | "launched", rolesNeeded?: string[] }`
**Response:** `Project`

### `GET /api/assets/:id/campaigns`
**Screen:** CommunityAssetView (board - campaigns)
**Response:** `Campaign[]`

### `GET /api/campaigns/:id`
**Screen:** Campaign detail (future)
**Response:** `Campaign`

### `POST /api/campaigns/:id/join`
**Screen:** Campaign card
**Response:** `Campaign`

### `POST /api/campaigns/:id/tasks/:taskId/complete`
**Screen:** Campaign task list
**Response:** `Campaign`

## Discovery Dashboard (Home)

### `GET /api/discover`
**Screen:** HomeHub (desktop), MobileHomeHub (mobile Discover tab)
**Response:** `DiscoverResponse` — `{ sections: DiscoverSection[] }` with sections:
- `topCommunities`: `DiscoverCommunity[]` — public communities not yet joined, ranked by memberCount, limited to ~10
- `peopleYouMayKnow`: `DiscoverPerson[]` — suggested people from shared communities/same school/shared interests, filtered by canMessage, limited to ~8
- `birthdays`: `DiscoverBirthday[]` — people whose birthday is today and have `showBirthday: true`, excluding current user unless it's their own birthday
- `events`: `DiscoverEvent[]` — upcoming events from #events assets of joined communities + highlighted public ones, limited to ~5
- `newStudents`: `DiscoverStudent[]` — recently joined students at user's school, limited to ~4
- `interestCommunities`: `DiscoverCommunity[]` — public communities matching user's skills/interests, excluding joined and topCommunities, limited to ~6
**Notes:** Each section loads independently; the client can also call per-section endpoints if needed.

### `POST /api/discover/people/:id/dismiss`
**Screen:** HomeHub (People you may know section)
**Response:** `{ ok: true }`
**Notes:** Dismissed suggestions stored in localStorage and excluded from future responses.

### `PATCH /api/me/privacy`
**Screen:** Settings > Privacy, Signup (details step)
**Request:** `{ showBirthday: boolean }`
**Response:** `{ ok: true }`
**Notes:** Defaults to false. Only users with this true appear in birthday sections of others who share a community.

---

## Home Feed (legacy - replaced by Discovery Dashboard)

### `GET /api/home/feed`
**Screen:** HomeHub (old)
**Query:** `{ after?: string }`
**Response:** `Paginated<Post>` — posts from feed-type assets (announcements, feed) of joined communities, grouped by community chip, latest first, max 40.

---

## Search

### `GET /api/search?q=...`
**Screen:** CommandPalette (Cmd+K), HomeHub help
**Response:** `SearchResults` — `{ people: SearchResult[], dms: SearchResult[], communities: SearchResult[] }`
**Notes:** No channels in results anymore.

## Direct Messages

### `GET /api/conversations`
**Screen:** MessagesPanel, MobileHub, DmDesktop
**Response:** `Conversation[]` — sorted by lastMessageAt desc.

### `POST /api/conversations`
**Screen:** ProfileView (Message button), CommandPalette (DM result)
**Request:** `{ username: string }`
**Response:** `Conversation`

### `GET /api/conversations/:id`
**Screen:** ThreadView
**Response:** `Conversation`

### `GET /api/conversations/:id/messages`
**Screen:** ThreadView
**Query:** `{ after?: string }`
**Response:** `Paginated<DirectMessage>`

### `POST /api/conversations/:id/messages`
**Screen:** ThreadView (composer)
**Request:** `{ text: string, replyToId?: string, replyPreview?: ReplyPreview }`
**Response:** `DirectMessage`

### `DELETE /api/conversations/:id/messages/:messageId`
**Screen:** ThreadView (message menu)
**Response:** `{ ok: true }`

### `POST /api/conversations/:id/read`
**Screen:** ThreadView (on mount)
**Response:** `{ ok: true }`

### `GET /api/unread`
**Screen:** CommunityStrip (badge), AppShell
**Response:** `{ count: number }` — total unread DMs.

## Presence

### `GET /api/presence?ids=...`
**Screen:** MemberList, CommandPalette, various avatars
**Request:** `ids: string[]`
**Response:** `Record<string, PresenceStatus>`

### `POST /api/presence`
**Screen:** UserPanel (Online/Appear offline)
**Request:** `{ mode: "online" | "offline" }`
**Response:** `{ presence: PresenceStatus }`

### `GET /api/me/stream` (SSE)
**Screen:** ThreadView (real-time updates)
**Response:** Server-sent events for new messages.

## Moderation

### `POST /api/block`
**Screen:** ProfileView (Block button), ThreadView
**Request:** `{ username: string }`
**Response:** `{ ok: true }`

### `DELETE /api/block/:username`
**Screen:** Settings (Blocked users)
**Response:** `{ ok: true }`

### `GET /api/blocked`
**Screen:** Settings
**Response:** `BlockedUser[]`

### `POST /api/report`
**Screen:** ProfileView, Explore card menu, CommunityAssetView
**Request:** `{ username: string, reason: string, note?: string }`
**Response:** `{ ok: true }`

## Badges

### `GET /api/badges`
**Screen:** ProfileView
**Response:** `Badge[]`

## Profile

### `GET /api/users/:username`
**Screen:** ProfileView
**Response:** `Profile` — includes `communitiesJoined: number`, `joinedCommunities: Community[]`, `projects: Project[]`, `campaigns: Campaign[]`, `badges: Badge[]`.

### `GET /api/users/:username/shared-communities`
**Screen:** ProfileView (DM profile card)
**Response:** `Community[]` — communities both users have joined.

---

## Type Definitions (from @square/shared)

```typescript
type Role = "owner" | "moderator" | "member";
type AssetKind = "chat" | "feed" | "board" | "list" | "form";
type AssetCategory = "Information" | "Community" | "Resources" | "Build";
type PresenceStatus = "online" | "offline" | "hidden";

interface Community {
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
  role?: Role | null;
}

interface AssetPermissions {
  canRead: Role[];
  canPost: Role[];
  canPin: Role[];
}

interface Asset {
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
  hiddenFromMembers?: boolean;
  locked?: boolean;
  unreadCount?: number;
  lastReadPostId?: string | null;
}

interface CommunityDetail {
  community: Community;
  assets: Asset[];
}

interface CommunityMembers {
  owners: CommunityMember[];
  moderators: CommunityMember[];
  online: CommunityMember[];
  offline: CommunityMember[];
}

interface CommunityMember {
  id: string;
  username: string;
  avatarUrl?: string;
  role: Role;
  presence?: PresenceStatus;
}

interface AssetCatalogEntry {
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

interface Post { ... }
interface AssetItem { ... }
interface Project { ... }
interface Campaign { ... }
interface DirectMessage { ... }
interface Conversation { ... }
interface SearchResults { ... }
interface SearchResult { ... }
interface Profile extends User { ... }

// PROPOSED: not in backend doc
interface DiscoverSection {
  id: string;
  items: any[];
}

// PROPOSED: not in backend doc
interface DiscoverResponse {
  sections: DiscoverSection[];
}

// PROPOSED: not in backend doc
interface DiscoverCommunity {
  id: string;
  name: string;
  slug: string;
  blurb: string;
  memberCount: number;
  category: string;
  bannerUrl?: string;
  avatar?: string;
  isPublic: boolean;
}

// PROPOSED: not in backend doc
interface DiscoverPerson {
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
interface DiscoverBirthday {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isCurrentUser?: boolean;
}

// PROPOSED: not in backend doc
interface DiscoverEvent {
  id: string;
  title: string;
  communityName: string;
  communitySlug: string;
  date: string;
  time?: string;
  place?: string;
}

// PROPOSED: not in backend doc
interface DiscoverStudent {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}
```

---

## Screens & Their API Calls

| Screen | API Calls |
|--------|-----------|
| Login | `requestCode`, `verifyCode` |
| Signup | `usernameAvailable`, `listSchools`, `signup` |
| HomeHub (Discover) | `discover`, `myCommunities`, `unread`, `me` |
| MobileHomeHub (Discover) | `discover`, `me`, `listConversations` |
| ExploreView | `exploreCommunities`, `getAssetCatalog` (for create modal), `createCommunity`, `joinCommunity` |
| CommunityStrip | `myCommunities`, `unread` |
| AppSidebar (in community) | `getCommunity` (for assets), `myCommunities` (when not in community) |
| CommunityAssetView | `getCommunity`, `listPosts`/`listItems`/`listProjects`/`listCampaigns`, `createPost`/`createItem`/`createProject`, `markAssetRead`, `listCommunityMembers`, `joinCommunity` |
| MemberList | `listCommunityMembers`, `getOrCreateConversation` |
| AddAssetDialog | `getAssetCatalog`, `addAsset` |
| ProfileView | `getProfile`, `sharedCommunities`, `getOrCreateConversation`, `blockUser`, `reportUser` |
| Settings | `me`, `updateMe`, `signUpload`, `listBlocked`, `unblockUser`, `updatePrivacy` |
| CommandPalette | `search` |
| ThreadView | `getConversation`, `listMessages`, `sendMessage`, `deleteMessage`, `markRead`, `getPresence`, `me/stream` (SSE) |
| CreateCommunityModal | `createCommunity`, `signUpload` |
| MobileHub (Messages) | `listConversations`, `markRead`, `me`, `search` |

---

## Notes

- All endpoints marked `PROPOSED: not in backend doc` in the mock API.
- The `channel` level has been removed. Communities now contain `assets` directly.
- Route structure: `/c/:community/:asset` (e.g., `/c/web3-club/general`).
- The word "tab" must not appear in any API response or UI.
- The word "channel" must not appear in any API response or UI (use "community" for the unit, "asset" for the space inside).