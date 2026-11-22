# Frontend/backend parity audit

Audit basis: the v1.1 parity requirements supplied with the task, Section 18.11's feature
checklist, the checked-in `frontend/`, `backend/`, `shared/`, and `docs/frontend-api-needs.md`.
Statuses are an initial inventory, not a completion claim. A feature is not `done` until its
parity Playwright spec passes against both mock mode and the real local backend.

## Source and audit constraints

- The checked-in `docs/backend-blueprint.md` is 288 lines and is not the supplied v1.1 document:
  it lacks the v1.1 introduction, Section 5.1, Section 8.17, Appendix E, and Section 18.11. The
  v1.1 attachment is the intended specification; this matrix records the checked-in source mismatch
  rather than silently treating the older file as v1.1.
- The attachment was not available as a readable workspace path during this inventory. Rows below
  include the Section 18.11 feature checklist and all discovered frontend routes/API methods. Exact
  Appendix E ordering/phase labels must be reconciled when the v1.1 file is present in the workspace.
- The only current app-level mock switch is `NEXT_PUBLIC_USE_MOCK`; feature-specific
  `USE_MOCK_*` switches were not found. The real client is selected globally, not per feature.
- `shared/src/schemas.ts` started with username, email, code, and DOB schemas. The first contract
  migration now adds reaction, mention, mentionable-member, and unread Zod schemas; corresponding
  mock/client/controller boundaries use them. Most other API areas still have TypeScript-only
  contracts, and no real handlers exist for them.
- Only gateway health/config/dev and reaction controllers were found. Service package folders
  other than the gateway are package/readme/index stubs. The database currently has kernel and
  reaction migrations, but no auth, profile, community, asset-default, mention, unread, notification,
  discovery, or other application migrations.
- No `frontend/e2e/parity/` specs currently exist. Existing feature specs do not establish parity
  against both mock mode and a real local backend.

## Feature inventory

`Backend status`: `done`, `partial`, or `missing`. `Contract match`: `yes` only when the shared
strict Zod contract is used by the mock and real handler/controller and the shapes agree; otherwise
`no`. Every row remains unverified until its parity spec passes in both modes.

| Feature | Frontend screen / route | Frontend calls and contract | Backend endpoint(s) / status | Contract match | Mock flag | Parity spec | Phase |
|---|---|---|---|---|---|---|---|
| Login, signup, session refresh, logout | `/login`, `/signup`, `/signup/setup`; session route | `requestCode`, `verifyCode`, `signup`, `usernameAvailable`, `listSchools`, `me`; unknown users get a ticket and existing users sign in | Auth/users/schools/session API: **missing**; no auth controller or auth schema | no | Global `NEXT_PUBLIC_USE_MOCK` | missing (`auth-flow.spec.ts` is not a two-mode parity spec) | v1.1 Appendix E label unavailable |
| Profile view and profile popover | `/u/[username]`, message mention links | `getProfile`, `getProfileProjects`, `getProfileActivity`, `getProfileBadges`, `sharedCommunities` | Users/profiles API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Profile edit, avatar/banner upload | `/settings`, `/settings/profile` | `me`, `updateMe`, `signUpload` | Users/media API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Privacy and birthday settings | `/settings/profile`, Home birthday card | `updatePrivacy`, `updateMe`; birthday opt-in must not expose DOB | Users/privacy API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Communities: create, preview, join, leave, roles, members | `/c/[community]`, `/explore`, community strip | `createCommunity`, `getCommunity`, `joinCommunity`, `leaveCommunity`, `listCommunityMembers`, `myCommunities`, `exploreCommunities` | Communities API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Invites and join requests | Community screens/actions | No typed client call found for invite or join-request flows | Communities invite/join-request API: **missing** | no; frontend API itself is incomplete | Global | missing | v1.1 Appendix E label unavailable |
| Assets: defaults, catalog, categories, order, add/remove, permissions | `/c/[community]`; sidebar; AddAssetDialog | `getAssetCatalog`, `listCommunityAssets`, `addAsset`, `reorderCommunityAssets`, `deleteAsset`, `updateAssetPermissions` | Assets API and default-asset seeding: **missing** | no | Global; `ALLOW_CUSTOM_ASSETS=false`, `ADD_ASSET_ROLES` shared constants | `community-assets.spec.ts` is not dual-mode parity | v1.1 Appendix E label unavailable |
| Mods-only visibility and membership rules | Community asset sidebar and asset routes | `getCommunity`, `listCommunityAssets`; catalog permission fields | Asset authorization endpoints: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Chat/feed: list, send, reply, edit, delete, pins, solved, search | `/c/[community]/[asset]` | `listPosts`, `createPost`, `markAssetRead`; UI also exposes requested edit/pin/solved/search behavior without complete typed calls | Chat/posts API: **missing** | no | Global | missing (mentions/reactions specs cover only a subset) | v1.1 Appendix E label unavailable |
| Unread banner and mark-read | Community asset view | `markAssetRead`; asset `unreadCount` | Asset read/unread API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Reactions: add/remove, limits, who-reacted, moderator clear, realtime | Community/DM message rows and reaction picker | `setMessageReaction`, `listReactionUsers`, `subscribeReactionEvents`; count summaries and resync events | Gateway reaction routes and service exist; **partial** (shared schemas are applied, but mock resync parity and dual-mode spec are missing) | no | Global | `reactions.spec.ts` exists but is not a dual-mode parity spec | Phase 3 per checked-in blueprint |
| Mentions: parse, badge states, jump and seen semantics | Community/DM chats, asset/DM lists | `listMentions`, `markMentionsSeen`, `mentionableMembers`; mock supports seed data and pagination | Mention endpoints, tables, outbox and counters: **missing** | no | Global | `mentions.spec.ts` exists but has not passed both modes | Phase 3 per checked-in blueprint |
| Mention autocomplete and audience filtering | Community/DM composers | `mentionableMembers(scope, roomId, {q,cursor,limit})` | Mentionable endpoints: **missing** | no | Global | missing dual-mode parity | Phase 3 per checked-in blueprint |
| DMs: start, messages, block state, mute/archive/hide | `/dm`, `/dm/[conversationId]`, mobile Messages | `listConversations`, `getOrCreateConversation`, `getConversation`, `listMessages`, `sendMessage`, `deleteMessage`, `markRead`, `setConversationMuted`, `hideConversation` | DM API: **missing** (only reaction routes reference DM messages) | no | Global | missing | v1.1 Appendix E label unavailable |
| Announcements, showcase, feedback | Asset routes and asset views | Posts/items/project calls, no complete showcase/feedback workflow contract | Feeds/assets API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Events: RSVP, cancel, calendar | Home and event assets | `discover`; no typed event RSVP/cancel/ICS methods found | Events API: **missing** | no; frontend API is incomplete | Global | missing | v1.1 Appendix E label unavailable |
| Resources and opportunities: save/deadline | Community asset views | `listItems`, `createItem`, `deleteItem` | Lists/resources API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Projects and hackathons boards | `/project/[id]`, project asset | `listProjects`, `getProject`, `createProject` | Boards/projects API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Campaigns: tasks, approval, leaderboard | Campaign asset/detail | `listCampaigns`, `getCampaign`, `joinCampaign`, `completeCampaignTask` | Campaign API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Badges | Profile and badge displays | `listBadges`, `getProfileBadges` | Badges API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Home discovery, birthdays, school recommendations | `/home` | `discover`; birthday and event card data; privacy boundary requires no DOB in responses | Discover API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Explore | `/explore` | `exploreCommunities` with category, sort, search and cursor | Explore API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Global/scoped search and suggestions | Command palette/search UI | `search`, `searchSuggested` | Search API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Notifications/inbox and unread summaries | `/inbox`, community/DM badges | `unreadCount`; inbox screen has no complete typed notification API | Notifications and `/me/unread`: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Presence and SSE resume | User panel, DM rows, reaction stream | `getPresence`, `setPresence`, `subscribeReactionEvents` | Reaction SSE exists; presence/notification SSE resume: **missing**; reaction stream **partial** | no | Global | missing dual-mode parity | v1.1 Appendix E label unavailable |
| Upload signing/media | Community creation, profile settings, post composer | `signUpload` | Media/upload API: **missing** | no | Global | missing | v1.1 Appendix E label unavailable |
| Backend-only gateway configuration and health | Not represented as product screens | No frontend API call for `/config` or `/_dev/dummy/health`; health probes are infrastructure-only | Gateway config/dev/health endpoints exist | N/A; backend-only | N/A | N/A | Infrastructure |
| Blueprint source version | Repository documentation | Audit specification requires v1.1 Appendix E/18.11 | Checked-in file lacks those sections: **missing** | no | N/A | N/A | Documentation prerequisite |

## Initial disposition

1. Contract differences are the first implementation gate. Expand `shared/` Zod schemas beyond the
   four primitive signup fields, then use those schemas at mock boundaries and all real controllers.
2. The real backend is missing nearly all frontend-backed APIs. Do not switch any mock flag off
   until that feature's dual-mode parity spec passes.
3. Implement missing controllers only after the shared contract inventory is reconciled with the
   v1.1 Appendix E and phase prompts. Preserve the existing reaction implementation; improve it only
   where the parity spec or contract audit proves a gap.
4. Fix and test behavior gaps only after inventory confirms their current state. Existing frontend
   code/tests are not evidence of real-backend parity.
