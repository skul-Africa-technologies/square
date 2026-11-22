# Frontend API Needs

This document lists every API endpoint the frontend calls, its request/response shape, and which screen uses it.

## Authentication

### `POST /api/auth/request-code`
**Screen:** Login, Signup
**Request:** `{ email: string }`
**Response:** `202 { ok: true }` for both known and unknown emails, with identical response body and timing. Never disclose account existence before verification.

### `POST /api/auth/verify-code`
**Screen:** Login, Signup
**Request:** `{ email: string, code: string }`
**Response for an existing account:** `{ isNewUser: false, user: User }`; sign the user in and set the session.
**Response for an unknown email:** `{ isNewUser: true, signupTicket: string }`; do not create an account. The ticket is valid for 15 minutes and is required by signup.

### `POST /api/auth/signup`
**Screen:** Signup
**Request:** `{ signupTicket: string, username: string, schoolId: string, dateOfBirth: string }`
**Response:** `{ user: User }`; create the account only on this request, then sign the user in and set the session.

The signup ticket can be used once. An expired or invalid ticket, unavailable username, or age-gate failure is returned as a typed API error. Username availability and signup must use the same normalized uniqueness rules.

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

The asset endpoints below are `// PROPOSED: not in backend doc`.

### `GET /api/asset-catalog`
**Screen:** AddAssetDialog
**Response:** `AssetCatalogEntry[]` — all default + optional catalog entries.

### `GET /api/communities/:slug/assets`
**Screen:** Desktop community sidebar, mobile community assets page
**Response:** `AssetCategoryGroup[]` — catalog-ordered category groups containing visible assets, unread counts, and read-only state.

### `POST /api/communities/:slug/assets`
**Screen:** AddAssetDialog
**Request:** `{ catalogKey: string }`
**Response:** `Asset` — the newly created asset instance.

### `DELETE /api/assets/:id`
**Screen:** Asset row actions (owners and moderators)
**Response:** `{ ok: true }`
**Notes:** Fails for default assets (`isDefault: true`).

### `PUT /api/communities/:slug/assets/order`
**Screen:** Community asset ordering
**Request:** `{ assetIds: string[] }`
**Response:** `AssetCategoryGroup[]`
**Notes:** Every asset must appear once; default assets retain their required order.

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

## Mentions and unread summaries

The mention endpoints and unread mention counts are `// PROPOSED: not in backend doc`.

### `GET /api/me/unread`
**Screen:** AppSidebar, CommunityStrip, mobile Messages tab
**Response:** `{ dm: { unread: number, mentions: number }, assets: { assetId: string, unread: number, mentions: number }[] }`
**Notes:** `mentions` is the subset of unread messages that tag the current user. Lists show a count, an `@` icon, or both from these two values.

### `GET /api/assets/:id/mentions?unread=true`
**Screen:** CommunityAssetView (mention jump button)
**Response:** `MentionRecord[]` — `{ messageId: string, seq: number, createdAt: string }[]`

### `POST /api/assets/:id/mentions/seen`
**Screen:** CommunityAssetView (visible/jumped mentions and leaving an asset)
**Request:** `{ messageIds?: string[], all?: true }`
**Response:** `{ ok: true }`
**Notes:** Call with message IDs when a mention was visible for 600 ms or jumped to; call with `{ all: true }` on exit using `sendBeacon` or `fetch(..., { keepalive: true })`.

### `GET /api/assets/:id/mentionable?q=&cursor=&limit=`
**Screen:** CommunityAssetView (message composer)
**Response:** `Paginated<MentionableMember>` — members who can read the asset, excluding the caller and blocked users.
**Notes:** Empty-query results rank recent speakers first, then alphabetically. Prefix matches precede contains matches.

### `GET /api/dm/conversations/:id/mentions?unread=true`
**Screen:** ThreadView (mention jump button)
**Response:** `MentionRecord[]`

### `POST /api/dm/conversations/:id/mentions/seen`
**Screen:** ThreadView (visible/jumped mentions and leaving a DM)
**Request:** `{ messageIds?: string[], all?: true }`
**Response:** `{ ok: true }`
**Notes:** Uses the same visibility, jump, and leave semantics as asset mentions.

### `GET /api/dm/conversations/:id/mentionable?q=&cursor=&limit=`
**Screen:** ThreadView (message composer)
**Response:** `Paginated<MentionableMember>` — only the other conversation participant, subject to block rules.

Mention parsing on message creation resolves `@username` against readable community members or the DM participant. It ignores code spans, self, unknown, blocked, and unreadable users; at most five distinct users are mentioned per message. Editing a message only adds newly mentioned users.

## Message Reactions

The following community-chat and DM endpoints are `// PROPOSED: not in backend doc`. Every chat
message and reply, and every DM message and reply, includes `reactions: [{ emoji, count, me }]`
ordered by the first reaction time. Feed-post like buttons are unchanged.

### `PUT /api/messages/:id/reactions/:emoji`
**Screen:** CommunityAssetView (chat message)
**Access:** `A:post`
**Response:** `204` — idempotently adds the current user's reaction.

### `DELETE /api/messages/:id/reactions/:emoji/me`
**Screen:** CommunityAssetView (chat message)
**Access:** `A:post`
**Response:** `204` — removes the current user's reaction.

### `GET /api/messages/:id/reactions/:emoji/users?cursor=...`
**Screen:** CommunityAssetView (who reacted)
**Access:** `A:read`
**Response:** `Paginated<ReactionUser>`

### `DELETE /api/messages/:id/reactions/:emoji`
**Screen:** CommunityAssetView (moderation)
**Access:** `C:mod`
**Response:** `204` — clears one emoji and writes an audit event.

### `DELETE /api/messages/:id/reactions`
**Screen:** CommunityAssetView (moderation)
**Access:** `C:mod`
**Response:** `204` — clears all message reactions and writes an audit event.

### `PUT /api/dm/messages/:id/reactions/:emoji`
**Screen:** ThreadView (DM message)
**Access:** Participant, unblocked
**Response:** `204` — idempotently adds the current user's reaction.

### `DELETE /api/dm/messages/:id/reactions/:emoji/me`
**Screen:** ThreadView (DM message)
**Access:** Participant, unblocked
**Response:** `204` — removes the current user's reaction.

### `GET /api/dm/messages/:id/reactions/:emoji/users?cursor=...`
**Screen:** ThreadView (who reacted)
**Access:** Participant, unblocked
**Response:** `Paginated<ReactionUser>`

### `GET /api/reactions/stream?scope=asset|dm&roomId=...` (SSE)
**Screen:** CommunityAssetView, ThreadView
**Response:** `reaction.resync` snapshot followed by authorized `reaction.updated` events for that
room. Community room subscriptions require read access; DM subscriptions require participant status
and no block.

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