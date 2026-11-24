# Square Backend Blueprint

Version 1.1 · Nov 22, 2026 · Owner: Vic · Built with Kilo

This file is the single source of truth for the Square backend. Put it in the repo at `docs/backend-blueprint.md`. Kilo reads it first, then builds the services in the order of Section 17. The frontend is already built, and every endpoint here is derived from it (typed client, mock data, `docs/frontend-api-needs.md`). Version 1.1 reconciles this file with the frontend as it stands today; Appendix E is the feature parity matrix and Section 18.11 is the prompt that proves frontend and backend match.

Priorities, in this order: **security, speed, lightness**. Everything below is shaped by them.

### What is new in 1.1 (Nov 22, 2026)
- Repository layout is now `frontend/`, `backend/<service>/`, `backend/kernel`, `backend/db`, `shared/`, `docs/`, `infra/` (Section 3.5). The old names (`apps/web`, `services/`, `packages/`) no longer apply.
- Login and signup are separate screens that share one API flow; only a brand-new account sees the setup page (Section 5.1).
- Message reactions in chat assets and DMs (Sections 6.6, 6.7, 8.16, 15.7, 15.8).
- Mentions: parsing, mention rows, unread summaries with `{unread, mentions}`, the jump-to-mention "seen" rules and autocomplete of every taggable member (Sections 8.1, 8.17).
- The `launch` deployment profile (three processes) for Pxxl and similar hosts, plus a cookie-domain option (Sections 3.3, 5.3, 12.3, 18.12).
- Appendix E, the feature parity matrix: every frontend screen and feature, the endpoints behind it and the phase that delivers it. Section 18.11 is the prompt that audits the frontend against the backend and closes every gap.

---

## 0. How to use this file

1. Copy this file to `docs/backend-blueprint.md` in the monorepo.
2. Paste the **Master prompt** (Section 18) into Kilo once at the start of the backend work.
3. Then paste one **Phase prompt** (Section 18) at a time. Do not skip phases; each phase ends with tests that must pass.
4. If the frontend's `docs/frontend-api-needs.md` or typed client disagrees with this file, Kilo writes the difference to `docs/api-contract-diff.md` and follows THIS file unless the frontend change is clearly better, then updates both.
5. Appendix E lists every frontend screen and feature with the endpoints behind it. Section 18.11 is the parity audit prompt: run it before Phase 2, after every phase and before launch.

---

## 1. Product model (what the backend must represent)

Square is "Discord for campus", connecting web2 and web3 students. It is **not** a build-and-get-rewarded app. Students join communities, talk in assets, and message each other. Projects and campaigns are optional assets.

- **Join only.** Users join communities. There is no follow of communities, channels or people anywhere.
- **DMs are in v1.**
- **Hierarchy:** Community (icon in the left strip) → Assets (the places inside a community: `#general`, `#announcements`, …). No channel level. No tab level. The UI never says "tab".
- **Default assets in every community (cannot be deleted):** `#general` (chat, everyone posts), `#announcements` (feed, owners and moderators post), `#guidelines` (rules page, owners and moderators edit), `#events` (event list, owners and moderators create).
- **Adding assets:** only owners and moderators, only from a fixed catalog (no custom assets in v1): support, introductions, off-topic, showcase, resources, opportunities, feedback, projects, campaigns, hackathons, mods-only (hidden from members).
- **Asset kinds (internal, never shown to users):** `chat`, `feed`, `rules`, `events`, `list`, `board`, `campaigns`. The earlier five-type idea (chat, feed, board, list, form) is extended with `rules`, `events` and `campaigns` because the frontend built dedicated pages for them. `form` is deferred.
- **Public and private communities.** Non-members can preview a public community read-only ("Join to post").
- **Roles:** owner, moderator, member. A non-member is a guest.
- **Home** is a discovery dashboard: top public communities, people you may know, people celebrating birthdays today, upcoming events, because-you-like, new from your school. Home also holds the DM list.
- **Profiles** have a banner, avatar, status, bio, school, department, level, interests, skills, links, badges, projects and activity.
- **Birthdays:** celebrating-today uses an opt-in flag. The date of birth is never exposed. Only the boolean "birthday today" for opted-in users is visible, day and month only.
- **Login and signup are separate screens.** An existing account that logs in goes straight to Home. Only a new account sees the setup page (username, school, date of birth). Both start with email and a 6-digit code.
- **Reactions:** every message and every reply in chat assets and DMs has a reaction button under it. Reaction chips appear only after someone actually reacts.
- **Mentions (tags):** `@username` tags up to 5 people per message. Tagged people get an `@` unread badge and a jump-to-mention button inside the chat; typing `@` lists every taggable member.
- **Wallets, tokens, treasuries, voting, funding, multi-campus:** out of v1.

---

## 2. Principles

### 2.1 Speed
- Hot paths touch Redis and one Postgres query. No service-to-service HTTP call on any read hot path.
- Every list uses keyset (cursor) pagination. No `OFFSET`. No `COUNT(*)` on request paths; counters are stored.
- No ORM. Typed SQL with Kysely. Every query is written, indexed and explained.
- Small payloads: only the fields the screen needs. Many clients are on weak mobile data in Lagos.
- Targets (p95, measured at the gateway, warm, 1 region):

| Operation | Target |
|---|---|
| Cached read (me, communities strip, asset list, unread) | < 40 ms |
| Uncached single read | < 100 ms |
| List read (messages, posts, members) | < 150 ms |
| Write (message, reaction, RSVP, save) | < 120 ms |
| Search | < 120 ms |
| Home aggregate | < 200 ms |
| Realtime delivery (send → other client) | < 300 ms |
| SSE connect | < 150 ms |

### 2.2 Security
- OWASP ASVS Level 2 is the bar. Nigeria Data Protection Act 2023 applies (consent, minimization, export, deletion).
- Default deny. Every query is scoped by membership. Never trust an id from the client without checking the caller can access it (prevents IDOR).
- One validation library (zod) at every boundary; DTOs are whitelists (no mass assignment).
- Secrets only in environment variables, never in code, logs or the client.

### 2.3 Lightness
- Small Node processes, tiny dependency set (Section 3.4), no heavy frameworks inside services beyond NestJS + Fastify.
- Each service owns a small surface and starts in under 2 seconds.
- Split by **code boundary**, co-deploy by **flag** (Section 3.3). More services in code, fewer processes while traffic is small.
- Redis is a cache and a bus, not a source of truth. Everything in Redis can be rebuilt from Postgres (Section 12.5).

---

## 3. Architecture

### 3.1 Shape

```
Browser / Next.js ──► Cloudflare (TLS, WAF, cache for public GETs)
                          │
                      API GATEWAY  (the only public service)
                          │  internal HTTP/2 (undici, keep-alive) + signed service tokens
   ┌────────┬────────┬───────┼────────┬─────────┬─────────┬─────────┐
 auth    users   communities assets   chat      dm       feeds    ...
   │        │        │         │       │         │         │
   └────────┴────────┴─── Postgres (Supabase) one schema per service
                          Redis: cache, rate limits, presence, streams (events)
                          Cloudinary: media (signed direct uploads)
```

- The frontend only ever calls the gateway.
- **Sync calls** between services: internal HTTP (undici with keep-alive pool) or in-process when co-deployed. Rare, never on read hot paths.
- **Async events** between services: Redis Streams with consumer groups (at-least-once, idempotent consumers). A `TRANSPORT=redis|nats` flag keeps NATS possible later; Redis is the default because it is already needed.
- **Realtime** is its own service (Section 7).

### 3.2 Services (19 deployable units, split as finely as makes sense)

| # | Service | Owns (schema) | Main jobs |
|---|---|---|---|
| 1 | `gateway` | nothing stored | TLS-terminated entry, JWT verify (local, no network call), rate limits, request ids, routing, timeouts, circuit breakers, BFF aggregates (`/me/bootstrap`, `/home`) |
| 2 | `auth` | `auth` | Email code request/verify, signup tickets, sessions, refresh rotation, device list, logout |
| 3 | `users` | `users` | Profiles, username rules, schools, privacy, blocks, interests, dismissed suggestions, account export/deletion |
| 4 | `badges` | `badges` | Badge definitions, awards, progress, pins; rule engine fed by events |
| 5 | `communities` | `communities` | Communities, membership, roles, invites, join requests, bans, member ordering |
| 6 | `assets` | `assets` | Asset catalog, assets, categories, per-asset permissions, ordering; guidelines rules and agreements |
| 7 | `chat` | `chat` | Community chat messages, replies, pins, reactions, solved flags, read cursors, in-asset search |
| 8 | `dm` | `dm` | Conversations, direct messages, read state, message-request limits |
| 9 | `feeds` | `feeds` | Posts (announcements, showcase, feedback), comments, reactions, votes, link previews |
| 10 | `events` | `events` | Events, RSVPs, attendees, `.ics` generation |
| 11 | `lists` | `lists` | Resources and opportunities entries, saves, deadlines |
| 12 | `boards` | `boards` | Projects and hackathon cards, stages, updates, join requests, milestones, team |
| 13 | `campaigns` | `campaigns` | Campaigns, tasks, participants, completions, leaderboard, results |
| 14 | `discover` | `discover` + Redis read models | Home dashboard, explore, recommendations, trending, birthdays |
| 15 | `search` | `search` | Global search index (users, communities, assets, events, entries, posts) |
| 16 | `notifications` | `notifications` | Inbox, mentions, preferences, mutes, unread summary |
| 17 | `realtime` | none (Redis) | SSE streams, presence, typing, fan-out of events to clients |
| 18 | `media` | `media` | Cloudinary signing, upload registry, cleanup |
| 19 | `moderation` | `moderation` | Reports, timeouts, audit log, abuse signals |

Why this split: each service has one reason to change, one schema, one scaling profile. Chat and DM are separate because they have the highest write rate and need independent scaling and partitioning. Realtime is separate so open connections never slow the REST services. Discover and search are read-model services so heavy ranking work never touches write paths. Badges, events, lists, boards and campaigns are separate so a bug or spike in one cannot take down chat.

### 3.3 Deployment profiles (light now, split later)

All services live in one monorepo and are Nest apps built from the same shared kernel. An env var `SERVICES=` chooses which modules boot in a process, and a `ServiceClient` abstraction calls in-process when the target is co-located and over internal HTTP when it is not.

| Profile | Processes | When |
|---|---|---|
| `dev` | 1 process, all services | local development |
| `pilot` | 6: gateway · core (auth, users, badges, communities, assets) · chat+dm · content (feeds, events, lists, boards, campaigns) · edge (discover, search, notifications, moderation, media) · realtime | first campus, ~100 to 5k users |
| `launch` | 3 backend processes plus the frontend: `launch-api` (gateway and every REST service in one process, calls between services are in-process) · `launch-realtime` · `launch-worker` (outbox relays, event consumers, scheduled jobs) | first deployment on Pxxl or a similar host, up to a few thousand users |
| `scale` | 19, one per service, each with its own replicas | when a service's p95 or CPU needs it |

Rule: moving between profiles needs configuration only, never code changes. The profile is chosen with `SERVICES_PROFILE` (`all`, `launch-api`, `launch-realtime`, `launch-worker`, `pilot`, `scale`) or an explicit `SERVICES=` list; a service that is not in the process list is reached over internal HTTP at its configured URL. A test boots the `all`, `launch`, `pilot` and `scale` profiles in CI.

### 3.4 Tech stack and dependency budget

| Concern | Choice |
|---|---|
| Runtime | Node 22 LTS, TypeScript strict |
| Framework | NestJS 11 with the **Fastify** adapter (not Express) |
| Validation | zod (shared schemas in `shared`, one source for frontend and backend); OpenAPI generated from zod at build time |
| DB access | Kysely + `pg`, SQL migrations (dbmate or node-pg-migrate), no ORM |
| DB | Supabase Postgres, pooled (transaction mode), one schema per service, one DB role per service, RLS on |
| Cache and bus | Redis (ioredis): cache, rate limit (Lua), presence, Streams, pub/sub |
| Tokens | `jose` (EdDSA / Ed25519 JWT) |
| Logging | pino (JSON, redaction), request id on every line |
| Metrics and traces | prom-client, OpenTelemetry (sampled) |
| HTTP out | undici (keep-alive pools) |
| Media | Cloudinary signed direct uploads |
| Tests | vitest, Testcontainers (Postgres, Redis), k6 for load |
| Not allowed | Prisma, TypeORM, GraphQL, class-validator/class-transformer, Express adapter, axios, lodash (use native), moment |

Dependency rule: every new package needs a one-line justification in the PR. Prefer platform APIs (`crypto`, `fetch`, `AbortController`, `Intl`).

### 3.5 Monorepo layout

```
square/                         (one git repository)
  frontend/                     the whole Next.js app: components, hooks, mock API layer, typed client, styles, public assets, Playwright tests
  backend/
    gateway/  auth/  users/  badges/  communities/  assets/  chat/  dm/  feeds/
    events/  lists/  boards/  campaigns/  discover/  search/  notifications/
    realtime/  media/  moderation/          one folder per service
    kernel/                     Nest bootstrap, auth guard, perm client, redis, db, outbox, events, logger, rate limiter, http client
    db/
      migrations/<schema>/      SQL files per service
      seeds/                    schools, catalog, badges, interest tags
  shared/                       zod schemas, types, constants, error codes, event schemas, username rules (used by frontend and backend)
  docs/
    backend-blueprint.md  api-contract-diff.md  parity-matrix.md  frontend-api-needs.md  DEPLOY.md  runbooks/  design/
  infra/
    docker/  k6/  ops/
```

`backend/kernel` is the key to lightness: auth guard, permission client, cursor helpers, outbox relay, event bus, rate limiter, error filter and health endpoints are written once, so each service is mostly its own SQL and handlers.

---

## 4. Cross-cutting rules

### 4.1 Conventions
- Base path `/v1`. All JSON. Dates are ISO 8601 UTC with `Z`.
- IDs: UUIDv7 (time-ordered, so keyset pagination and index inserts are fast). Public handles: `username` (no `#`), community `slug`, asset `key`.
- Pagination: `?limit=30&cursor=<opaque>`. Default 30, max 100. Response: `{ "data": [...], "page": { "next": "…", "prev": "…" } }`. Cursor is base64url of `{id}` (or `{score,id}` for ranked lists).
- Errors, one shape everywhere:
  ```json
  { "error": { "code": "asset_forbidden", "message": "You can't post here.", "field": null, "requestId": "01J…" } }
  ```
  Codes are stable strings from `shared/errors.ts`. Never leak stack traces or SQL.
- Idempotency: creating endpoints accept `Idempotency-Key` (24h, stored in Redis); messages use `clientMsgId` (unique per author) so a retry never duplicates.
- Caching: `ETag` + `If-None-Match` on cacheable GETs; `Cache-Control: private, no-store` on anything personal.
- Concurrency: updates that can race (edit post, change stage) accept `If-Match` with `updatedAt` version; return `409 conflict` on mismatch.
- Rate limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After` on 429.
- Soft delete (`deleted_at`) for user-visible content; bodies are wiped 30 days after deletion by a job.
- Time zone: stored UTC; user time zone default `Africa/Lagos`, used only for "today" logic (birthdays, "Today/Tomorrow" event grouping).

### 4.2 Roles and permissions

Roles: `guest=0`, `member=1`, `moderator=2`, `owner=3`.

Each asset has three thresholds: `read_min`, `post_min`, `manage_min` (post means write or create in that asset's kind), plus `public_read` (true if non-members may preview in a public community).

Defaults from the catalog:

| Asset | Kind | read | post | manage | Public preview |
|---|---|---|---|---|---|
| general | chat | member (guest if public) | member | moderator | yes |
| announcements | feed | guest | moderator | moderator | yes |
| guidelines | rules | guest | moderator | moderator | yes |
| events | events | guest | moderator | moderator | yes |
| support | chat | guest | member | moderator | yes |
| introductions | chat | guest | member | moderator | yes |
| off-topic | chat | member | member | moderator | no |
| showcase | feed | guest | member | moderator | yes |
| resources | list | guest | member | moderator | yes |
| opportunities | list | guest | member | moderator | yes |
| feedback | feed | guest | member | moderator | yes |
| projects | board | guest | member | moderator | yes |
| campaigns | campaigns | guest | moderator (create) / member (take part) | moderator | yes |
| hackathons | board | guest | member | moderator | yes |
| mods-only | chat | moderator | moderator | owner | **never visible to members** |

Enforcement, the same everywhere through `PermissionClient` in the kernel:

```
can(userId, assetId, action):   // action ∈ read | post | manage
  role  = redis GET perm:{communityId}:{userId}   // 0..3, TTL 5 min, DEL on member events
  asset = redis HGETALL asset:{assetId}           // {communityId, kind, read_min, post_min, manage_min, public_read}
  miss → one call to owning service, then populate cache
  banned or timed out → deny
```

Two Redis reads in one pipeline. No inter-service call on a hit. Ownership of `perm:*` is `communities`; `asset:*` is `assets`. When a role changes or an asset changes, the owner deletes the key and publishes an event.

Per-item rules on top of kind permissions: authors can edit or delete their own content; moderators can remove, pin or lock anything in their community; owners can do everything; nobody can act on a higher role.

### 4.3 Trust levels (anti-abuse)

| Level | Who | Limits |
|---|---|---|
| 0 | new or unverified account (< 24 h or no verified student) | 3 messages/min, no links in chat, no DMs to non-shared users, no uploads over 2 MB |
| 1 | verified student | standard limits |
| 2 | established (7 days and 50 messages and no upheld reports) | standard limits, links allowed, higher DM limits |

Trust level is stored on the user, cached in the access token claims (`tl`), recalculated by a daily job and on report decisions.

---
## 5. Authentication and sessions

### 5.1 Flow (one API flow, two screens)

The frontend has two entry screens, `/login` and `/signup`, that call the same three endpoints. The screen changes only the wording and what happens after the code is verified. The backend never receives which screen was used.

1. `POST /v1/auth/request-code {email}` → always `202 {ok:true}` whether or not the email exists (no enumeration). Generic timing (always do the same work).
2. `POST /v1/auth/verify-code {email, code}`:
   - existing account → sets session cookies, returns `{ isNewUser:false, user }`. This auth response's user card includes a server-computed `profileComplete` boolean, but never email or DOB.
   - new email → returns `{ isNewUser:true, signupTicket }` (JWT, scope `signup`, 15 min, single use). No account is created and nobody is logged in.
3. `POST /v1/auth/signup {signupTicket, username, schoolId, dateOfBirth}` → creates the user, sets session cookies, returns `{user}` with `profileComplete:true` (never email or DOB). Emits `user.created`.

Behavior by screen (decided by the frontend from `isNewUser`):
- **Log in + existing account:** signed in, go to Home (or the safe relative `next` path). The setup page is never shown.
- **Log in + unknown email:** nothing is created. The frontend shows "No account for this email yet" with a "Create account" button that continues to setup using the already verified `signupTicket` (no second code).
- **Sign up + new email:** setup page (username with live availability check, school, date of birth), then `POST /auth/signup`, then Home.
- **Sign up + existing account:** no setup page; the user is signed in and told they already had an account.
- An account exists only after `POST /auth/signup` succeeds. Abandoning setup creates nothing; the user repeats the flow.
- Whether an email has an account is revealed only after the code is proven, never by `request-code`, response time or error text.
- Guards never decide from "profile looks incomplete". If a legacy account lacks required fields, the user is sent to `/settings/profile` with a banner, never to the signup setup.
- `profileComplete` is computed by the auth service from required stored profile fields. It is only an auth response routing hint for legacy accounts, not a substitute for authorization and not a signal that exposes which field is missing.

### 5.2 Email code
- 6 digits from `crypto.randomInt`, never `Math.random`.
- Stored hashed: `HMAC-SHA256(code, pepper || emailHash || codeId)`. The plain code exists only in the email.
- State lives in Redis (TTL = expiry), so it is fast and expires on its own: `ac:{emailHash}` → `{ hash, attempts, resendAt, ip }`.
- Rules: expires in 10 minutes; single use; 5 wrong attempts cancel the code; resend cooldown 60 s; max 5 codes per email per hour; 10 per IP per hour; constant-time compare; same response for known and unknown emails.
- Audit row per attempt in `auth.login_events` (hashed email, hashed IP, outcome), kept 90 days.
- Email provider: Resend or Postmark (SPF, DKIM, DMARC set before launch). Send via a queue job so the request returns in ms; retry with backoff; never include the code in logs.

### 5.3 Tokens
- **Access token:** JWT, EdDSA (Ed25519), 10 minutes, claims `{ sub, sid, tl, v, iat, exp, iss, aud }`. The gateway verifies it **locally** with the public key (no network call). Key rotation through `kid`; two keys valid during rotation.
- **Refresh token:** opaque 256-bit random, stored only as a SHA-256 hash in `auth.sessions`, 30 days sliding, **rotated on every use**. Each token belongs to a `family_id`. Reuse of an already-rotated token revokes the whole family (theft detection) and forces re-login.
- Delivery: `HttpOnly; Secure; SameSite=Lax; Path=/` cookies. Default (web and API on one host, or the API proxied through the Next.js app): `__Host-` prefixed names. When the web app and API sit on different subdomains of your own domain (recommended on Pxxl: `app.<domain>`, `api.<domain>`, `stream.<domain>`), set `COOKIE_DOMAIN=.<domain>` and use `__Secure-` prefixed names with `Domain=.<domain>`. Access cookie for the API, refresh cookie scoped to `/v1/auth/refresh`. CORS allows only the origins in `WEB_ORIGINS`, with credentials.
- CSRF: because cookies are used, every state-changing request must carry `X-Square-CSRF` (a double-submit value also stored in a readable cookie) and a matching `Origin`. Reject otherwise.
- Sessions list: user can see devices (hashed UA, coarse location) and revoke one or all. A `v` (session version) claim in the token lets `logout-all` invalidate instantly via a Redis denylist keyed by `sid`.
- Internal calls between services: signed **service tokens** (EdDSA, `aud` = target service, 60 s) plus a signed `x-user` context header created by the gateway. Services never accept public traffic.

### 5.4 Education status
- Signup lets the user select `student` or `alumni` using their regular email address. Persist this self-reported value as `education_status`; it does not set `is_verified_student`, change trust level or award a verification badge.
- Institutions are selected from the searchable `users.schools` directory. Names and aliases are indexed for suggestions; the initial records are not an exhaustive registry.
- Any future student-verification process must be separate, institution-approved and explicitly designed before it can grant verified status or badges.

### 5.5 Username rules (shared in `shared`)
- Stored without `#`, lowercase, NFC-normalized. Displayed with exactly one `#`.
- Allowed: letters and emoji, separated by single hyphens. No digits, spaces, underscores or other symbols. Length 3 to 24 visible characters.
- Pattern: `^[\p{L}\p{Extended_Pictographic}]+(-[\p{L}\p{Extended_Pictographic}]+)*$` with the `u` flag.
- Reserved list (admin, square, support, moderator, system, staff, …) and a profanity list rejected on signup and rename.
- **Confusable check:** compute a "skeleton" (strip diacritics, map look-alike letters) and keep a unique index on it so `#victory-gray` and `#victοry-gray` (Greek o) cannot coexist.
- Availability: `GET /v1/users/username-available?u=` hits Redis first (`un:{name}` negative cache 60 s), then a unique-index lookup. Rate limited, and returns only `{available:boolean}`.
- Rename: allowed once per 30 days (open decision O3); old name reserved for 90 days.

---

## 6. Data model (Postgres, one schema per service)

General rules for every table: `id uuid` UUIDv7 default, `created_at timestamptz default now()`, `updated_at` where mutable, `deleted_at` where soft-deleted. Cross-schema foreign keys are **not** used (services own their data); IDs reference other services by value and are validated through events or the permission cache. Each service connects with its own DB role that can only touch its schema. RLS is enabled on every table with a policy that allows only that role (defense in depth against a leaked key).

### 6.1 `auth`
- `identities(user_id pk, email citext unique, email_verified_at, status, created_at)`
- `sessions(id, user_id, family_id, refresh_hash bytea unique, ua_hash, ip_hash, created_at, last_used_at, expires_at, revoked_at, replaced_by)` · idx `(user_id)`, `(family_id)`
- `login_events(id, email_hash, ip_hash, kind, ok, created_at)` (partition monthly, keep 90 days)
- Redis only: `ac:{emailHash}` (code state), `rl:*` (rate limits), `sid:deny:{sid}` (revoked sessions)

### 6.2 `users`
- `users(id, username citext unique, username_skeleton citext unique, school_id, education_status text, department, level smallint, bio varchar(160), status varchar(80), location, languages text[], interests text[], skills text[], links jsonb, avatar_url, banner_url, date_of_birth date, birthday_md smallint, birthday_opt_in bool default false, appear_offline bool default false, show_communities bool default true, dm_privacy text default 'shared', timezone text default 'Africa/Lagos', is_verified_student bool, verified_at, trust_level smallint default 0, featured_project_id, badge_pins uuid[], stats jsonb, locale, created_at, updated_at, deleted_at)`
  - `date_of_birth` is private: never selected by any public query, never returned. Column-level `SELECT` revoked from every role except `users` and the export job.
  - `birthday_md = month*100 + day`, partial index `WHERE birthday_opt_in AND deleted_at IS NULL`.
  - `stats` holds counters `{communities, badges, projects}` kept up to date by events.
- `schools(id, name, institution_type, ownership)` and `school_aliases(school_id, alias, normalized_alias)`; trigram indexes support name/alias suggestions. `education_status` is self-reported and separate from verification.
- `interest_tags(slug pk, label, category)`
- `blocks(blocker_id, blocked_id, created_at, pk(blocker_id, blocked_id))` · idx `(blocked_id)`
- `dismissed_suggestions(user_id, target_id, created_at, pk)`
- `deletion_requests(user_id, requested_at, scheduled_for, status)` (7-day grace)

### 6.3 `badges`
- `badge_defs(id, slug unique, name, description, icon, rarity, criteria jsonb, is_active)`
- `user_badges(user_id, badge_id, earned_at, source jsonb, pk(user_id, badge_id))`
- `badge_progress(user_id, badge_id, progress int, pk)`

### 6.4 `communities`
- `communities(id, slug unique, name, description, avatar_url, banner_url, category text (web2|web3|both), school_id null, visibility (public|private), join_policy (open|request|invite), owner_id, members_count int, created_at, updated_at, deleted_at)`
- `members(community_id, user_id, role smallint, joined_at, pk(community_id, user_id))` · idx `(user_id, community_id)`
- `member_order(user_id, community_id, position, pk)` (the strip order)
- `join_requests(id, community_id, user_id, message, status, decided_by, created_at)`
- `invites(code pk, community_id, created_by, max_uses, uses, expires_at, revoked_at)`
- `bans(community_id, user_id, reason, until, created_by, created_at, pk)`
- Name search: `pg_trgm` GIN on `name`.

### 6.5 `assets`
- `asset_catalog(key pk, label, kind, category, description, default_read, default_post, default_manage, public_read, requires_role_to_add, hidden_from_members, unique_per_community)` (seeded, static)
- `assets(id, community_id, key, name, kind, category, position, is_default, topic, read_min, post_min, manage_min, public_read, created_by, created_at, deleted_at)` · unique `(community_id, key)` · idx `(community_id, position)`
- `rules(id, asset_id, position, title, body, updated_by, updated_at)` · guidelines content
- `rules_meta(asset_id pk, version int, updated_at)`
- `rule_agreements(user_id, community_id, version, agreed_at, pk(user_id, community_id))`
- Creating a community inserts the four default assets in the same transaction (via `community.created` consumed synchronously by an internal call, with a transactional guarantee through the outbox; the community is not listed as ready until its assets exist).

### 6.6 `chat`
- `messages(id uuidv7, asset_id, author_id, body text (max 2000), reply_to_id, client_msg_id, mentions uuid[], seq bigint, created_at, edited_at, deleted_at, deleted_by, solved_by, solved_at)` · **partitioned by month**
  - idx `(asset_id, id desc)` for paging and `(asset_id, seq)` for the unread banner; unique `(author_id, client_msg_id)`; GIN `to_tsvector('simple', body)` for in-asset search (per partition)
  - `seq` is the per-asset monotonic counter taken from Redis `INCR seq:{assetId}` (also persisted).
- `pins(asset_id, message_id, pinned_by, pinned_at, pk(asset_id, message_id))`
- `reactions(message_id, user_id, emoji varchar(32), created_at, pk(message_id, user_id, emoji))` · idx `(message_id, emoji, created_at)` and `(user_id, message_id)`
- `reaction_counts(message_id, emoji, count int, first_at timestamptz, pk(message_id, emoji))` maintained in the same transaction as `reactions` (lists never GROUP BY at read time); a nightly job reconciles counts from `reactions`
- `mentions(user_id, asset_id, message_id, seq bigint, created_at, seen_at null, pk(user_id, message_id))` · partial idx `(user_id, asset_id) WHERE seen_at IS NULL`; one row per mentioned user (at most 5 per message)
- `asset_reads(user_id, asset_id, last_read_seq bigint, updated_at, pk(user_id, asset_id))`
- Reply preview: the reply row returns `{id, authorId, bodySnippet(120), deleted}` by joining one row; no recursive loads.

### 6.7 `dm`
- `conversations(id, pair_key text unique (min(userA,userB)||':'||max(...)), user_a, user_b, created_at, last_message_at, last_seq bigint)`
- `participants(conversation_id, user_id, last_read_seq, muted bool, archived bool, hidden_at, pk(conversation_id, user_id))` · idx `(user_id, last_message_at)` via denormalized `last_message_at`
- `dm_messages(id uuidv7, conversation_id, sender_id, body, reply_to_id, client_msg_id, seq, created_at, edited_at, deleted_at)` partitioned monthly · idx `(conversation_id, id desc)` · unique `(sender_id, client_msg_id)`
- `message_requests(conversation_id, from_id, to_id, count int, status)` for first-contact limits.
- `reactions`, `reaction_counts` and `mentions`: same shape as in `chat`, keyed by the DM message id (`dm.reactions`, `dm.reaction_counts`, `dm.mentions`).

### 6.8 `feeds`
- `posts(id, asset_id, community_id, author_id, kind (announcement|showcase|feedback), title, body, media jsonb, link_preview jsonb, pinned bool, pinned_at, comments_enabled bool, status (open|planned|done|null), likes_count, up_count, comments_count, score double, created_at, edited_at, deleted_at, version int)` · idx `(asset_id, pinned desc, id desc)`, `(asset_id, score desc, id desc)`
- `comments(id, post_id, author_id, parent_id null (one level), body, created_at, deleted_at)` · idx `(post_id, id)`
- `post_reactions(post_id, user_id, type (like|up), created_at, pk(post_id, user_id, type))`

### 6.9 `events`
- `events(id, asset_id, community_id, title, description, starts_at, ends_at, timezone, place, online_url, cover_url, status (scheduled|cancelled), created_by, going_count, interested_count, version, created_at, updated_at)` · idx `(asset_id, starts_at)`, `(community_id, starts_at)`
- `rsvps(event_id, user_id, state (going|interested|not_going), updated_at, pk(event_id, user_id))` · idx `(user_id, state)`

### 6.10 `lists`
- `entries(id, asset_id, community_id, author_id, title, url, url_domain, description, tags text[], deadline_at, pinned bool, saves_count, status (open|closed), created_at, updated_at, deleted_at)` · idx `(asset_id, id desc)`, GIN `tags`, `(asset_id, deadline_at)`; trigram on `title`
- `saves(entry_id, user_id, created_at, pk(entry_id, user_id))` · idx `(user_id, created_at desc)`

### 6.11 `boards`
- `items(id, asset_id, community_id, owner_id, title, blurb, description, why, stage text, needs text[], team_count, position, version, created_at, updated_at, deleted_at)` · idx `(asset_id, stage, position)`
- `item_members(item_id, user_id, role, joined_at, pk)`
- `item_updates(id, item_id, author_id, body, created_at)`
- `milestones(id, item_id, title, done bool, due_at, position)`
- `join_requests(id, item_id, user_id, message, status (pending|approved|declined), decided_at, created_at)` unique `(item_id, user_id)` while pending

### 6.12 `campaigns`
- `campaigns(id, asset_id, community_id, title, goal, starts_at, ends_at, status (draft|active|ended), created_by, participants_count, created_at)`
- `tasks(id, campaign_id, title, description, points int, badge_id null, proof_required bool, position)`
- `participants(campaign_id, user_id, points int, joined_at, last_scored_at, pk(campaign_id, user_id))`
- `completions(id, task_id, campaign_id, user_id, status (pending|approved|rejected), proof jsonb, decided_by, decided_at, created_at)` unique `(task_id, user_id)`
- `results(campaign_id pk, snapshot jsonb, finalized_at)`

### 6.13 `discover`
- Redis read models (Section 8) plus `discover.community_scores(community_id pk, score, members_growth_7d, msgs_7d, computed_at)` for fallbacks and audits.

### 6.14 `search`
- `docs(id, kind (user|community|asset|event|entry|post), ref_id, community_id null, visibility, title, subtitle, body, tsv tsvector, updated_at)` · GIN on `tsv`, GIN trigram on `title` and `subtitle`, idx `(kind, ref_id)` unique
- Messages are **not** globally indexed; they are searched inside one asset by `chat` (Section 8.7).

### 6.15 `notifications`
- `notifications(id, user_id, kind, actor_id, community_id, asset_id, ref_id, data jsonb, read_at, created_at)` · idx `(user_id, id desc)`, partial idx `(user_id) WHERE read_at IS NULL`
- `prefs(user_id, scope (global|community|asset), scope_id, level (all|mentions|none), muted_until, pk(user_id, scope, scope_id))`
- `push_subscriptions(id, user_id, endpoint, keys, created_at)` (later)

### 6.16 `media`
- `uploads(id, owner_id, kind (avatar|banner|post|event_cover|community), public_id, url, bytes, mime, width, height, status (pending|ready|rejected), created_at)` · idx `(owner_id)`, `(status, created_at)` for cleanup

### 6.17 `moderation`
- `reports(id, reporter_id, target_kind, target_id, community_id, reason, details, status (open|actioned|dismissed), handled_by, created_at, handled_at)` · idx `(community_id, status, id desc)`
- `timeouts(community_id, user_id, until, reason, created_by, pk)`
- `audit_log(id, actor_id, action, target_kind, target_id, community_id, meta jsonb, ip_hash, created_at)` partition monthly, append-only (no `UPDATE`/`DELETE` grants)

### 6.18 Transactional outbox (in every service schema)
- `outbox(id, type, version, payload jsonb, created_at, published_at)`; an event is written in the same transaction as the data change. A relay (polling every 200 ms with `FOR UPDATE SKIP LOCKED`, plus `LISTEN/NOTIFY` wake-ups) publishes to Redis Streams and marks `published_at`. Guarantees no lost events when a process dies between commit and publish.

### 6.19 Redis key catalog

| Key | Type | Owner | TTL / note |
|---|---|---|---|
| `perm:{communityId}:{userId}` | string (role) | communities | 5 min, DEL on member events |
| `asset:{assetId}` | hash | assets | invalidated on asset events |
| `assets:{communityId}` | string (list JSON) | assets | 10 min, versioned |
| `usr:{userId}` | hash (username, avatar, school, verified, presenceHidden) | users | 10 min, for batch hydration (`MGET`) |
| `ucomm:{userId}` | set of community ids | communities | rebuilt from members |
| `cmem:{communityId}` | zset (recent activity score, user id), capped 500 | communities | sampling for suggestions |
| `seq:{communityId}` | hash assetId → latest seq | chat | persisted every 30 s |
| `reads:{userId}` | hash assetId → last_read_seq | chat | write-through from Postgres |
| `dmseq:{convId}`, `dmreads:{userId}` | hash | dm | same idea |
| `pres:{userId}` | string | realtime | 60 s, refreshed by heartbeat |
| `online:{communityId}` | zset (ts, userId) | realtime | trimmed to last 60 s |
| `stream:{userId}` | stream | realtime | resume buffer, max 200 entries |
| `disc:top` | zset (communityId, score) | discover | rebuilt every 5 min |
| `disc:people:{userId}` | string JSON | discover | 1 h |
| `bday:{md}:{tz}` | set of user ids | discover | built at 00:05 local time |
| `lb:{campaignId}` | zset | campaigns | persisted to Postgres at end |
| `rl:{class}:{key}` | counters | kernel | per limiter window |
| `idem:{userId}:{key}` | string | kernel | 24 h |
| `un:{name}` | string | users | 60 s negative cache |
| `ment:{userId}` | hash assetId or convId → unseen mention count | chat, dm | rebuilt from `mentions` |
| `act:{assetId}` | zset (last activity, userId), capped 200 | chat | ranks mention autocomplete |
| `evt:{name}` | streams | each service | consumer groups, `MAXLEN ~ 100000` |

---

## 7. Realtime design (SSE first)

One streaming connection per browser tab, `GET /v1/me/stream` (Server-Sent Events over HTTP/2). SSE is lighter than WebSockets for this use (server → client, simple reconnect, works through proxies); client → server uses ordinary POSTs.

- **Auth:** same cookie; the `realtime` service verifies the access token locally.
- **What flows over it:** `dm.message`, `message.created` (only for the asset the user is viewing), `unread.bump` (tiny: `{assetId, seq, mention?}` for all other assets), `reaction.updated` (only for the asset or DM on screen), `presence`, `typing`, `notification`, `event.updated`, `role.changed`, `session.revoked`.
- **Hot room model (the speed trick):** the client tells the server what it is looking at with `PUT /v1/me/stream/view {assetId | conversationId | null}`. Full message payloads are pushed only for that one view; every other asset gets only an `unread.bump`. This keeps fan-out proportional to people actually watching.
- **Fan-out path:** `chat` writes the message → outbox → Redis Stream → `realtime` consumer → Redis pub/sub channel `room:{assetId}` → the instances holding sockets for viewers of that asset write to their connections. No Postgres reads in the path (the event carries the hydrated payload).
- **Resume:** each event has an id; the client reconnects with `Last-Event-ID`; `realtime` replays from `stream:{userId}` (last 200) or tells the client to refetch (`resync` event).
- **Heartbeat:** a comment line every 25 s (keeps mobile proxies from closing the socket) and the same heartbeat refreshes presence.
- **Backpressure:** per-connection queue limit (200 events); on overflow drop to `resync` instead of growing memory.
- **Limits:** 3 streams per user, 20 000 concurrent connections per realtime instance target; connection draining on deploy with `retry:` hint so clients reconnect smoothly.
- **Presence:** online when a stream is open and a heartbeat arrived within 60 s; idle after 5 min of no input (client `POST /me/presence`); honors `appear_offline` (never reveals presence, shows offline). Counts per community come from `online:{communityId}` (`ZCOUNT` of the last 60 s). Counts are approximate by design.
- **Typing:** `POST .../typing` rate-limited to 1 per 3 s, broadcast to the room with a 5 s expiry; behind a feature flag `ENABLE_TYPING`.
- **Web Push (later):** `push_subscriptions`; the notification service sends when the user has no open stream.

---
## 8. Algorithms and strategies

### 8.1 Unread counts without fan-out (O(1) per asset)
Writing a row per member per message would explode in big communities. Instead:
- Every asset has a monotonic counter: on message create, `seq = HINCRBY seq:{communityId} {assetId} 1` (atomic). The message stores `seq`.
- Each user has a read cursor per asset: `reads:{userId}` hash `assetId → last_read_seq` (write-behind to `chat.asset_reads` every 5 s via a stream).
- `unread = max(0, latest_seq − last_read_seq)`, displayed capped at `99+`.
- On join, the cursor is set to the current `latest_seq`, so a new member sees 0 unread, not 10 000.
- `POST /assets/:id/read {seq}` only moves the cursor forward.
- **Mentions** are the one fan-out: only the (at most 5) mentioned users get a `mentions` row and `HINCRBY ment:{userId} {assetId} 1`. Every unread summary carries both numbers `{unread, mentions}`. The UI shows the number only when `mentions = 0`; only an `@` icon when `unread == mentions`; the `@` icon plus the total number when `unread > mentions`. Mentions are marked seen only by the client (the tagged message was visible, the user jumped to it, or the user left the asset or DM), never merely by opening the chat. See Section 8.17.
- `GET /me/unread` = one pipeline: for each of my communities `HGETALL seq:{c}` plus my `reads` hash, returns only assets with `unread > 0` (each with its `mentions`) and the DM totals. Under 20 ms.
- The banner "12 new messages since 4:56 PM" needs the time of the first unread: `SELECT created_at FROM messages WHERE asset_id=$1 AND seq=$2+1` (index `(asset_id, seq)`; add it to `chat.messages`).
- DMs use the same scheme with `dmseq:{convId}` and `dmreads:{userId}`.

### 8.2 Top public communities (Discover and Explore)
A job in `discover` runs every 5 minutes and writes `disc:top` (zset). For each public community, using min-max normalization across all public communities:

```
score = 0.30 * norm(ln(1 + members))
      + 0.30 * norm(ln(1 + distinct_authors_7d))     // distinct people, not message count: one spammer can't inflate it
      + 0.20 * norm(ln(1 + messages_7d))
      + 0.15 * norm(clamp(member_growth_7d / max(members_7d_ago, 20), 0, 2))
      + 0.05 * freshness                              // 1 → 0 over the first 14 days so new good communities surface
```

Personal re-rank at request time over the top 100 only (cheap):

```
final = score
      + 0.25 * sameSchool
      + 0.20 * jaccard(userInterests, communityTags)
      + 0.15 * categoryAffinity   // share of my joined communities in the same web2/web3 category
exclude: already joined, banned, communities owned by someone I blocked
diversity: at most 2 of the same category in the first 6
```

Cache per user 5 minutes, stale-while-revalidate. Cold start (no data) falls back to the global order. Same logic powers `/explore` with filters (category, school, search) and cursor `{score,id}`.
"Because you like <interest>" tiles: for each of the user's top 3 interests, take the highest-scoring communities tagged with that interest. "New from your school": public communities with the same `school_id`, newest first.

### 8.3 People you may know
No follow graph, so use shared context. Entirely Redis-backed, so it is fast:

```
candidates = union over my communities c of top 100 of cmem:{c}   (cap 400)
exclude   = me, blocked either way, dismissed, existing DM partners, deleted users
score = 3.0 * min(sharedCommunities, 3) / 3      // SINTERCARD ucomm:{me} ucomm:{candidate}
      + 1.5 * sameSchool
      + 1.0 * sameDepartment
      + 0.5 * (|levelDiff| <= 1)
      + 2.0 * jaccard(interests)
      + 0.5 * activeInLast7d
      + 0.3 * verifiedStudent
diversity: max 4 from the same single community
return top 10 with reason chips: "3 communities in common", "FUT Minna", "Design"
```

Cold start (joined nothing): same school, then same department, then most active verified users. Cache `disc:people:{userId}` 1 hour; invalidate when I join or leave a community. If a user has `show_communities=false`, the "communities in common" reason is hidden but still used for ranking. `POST /discover/people/:id/dismiss` writes `dismissed_suggestions`.

### 8.4 Birthdays ("celebrating today")
Privacy first. The date of birth never leaves the `users` service.
- At signup, `users` stores `date_of_birth` (private) and derives `birthday_md = month*100 + day`.
- `birthday_opt_in` defaults to **false**. Only opted-in users can appear.
- Every night at 00:05 in each timezone group (v1: `Africa/Lagos`; the job loops over distinct `timezone` values), `discover` builds `bday:{md}:{tz}` = set of opted-in user ids whose `birthday_md` is today (29 Feb counts as 28 Feb in non-leap years).
- Request (`GET /discover/birthdays`):
  1. `B = SMEMBERS bday:{todayMd}:{viewerTz}` (small, about 0.3% of opted-in users).
  2. Remove people I blocked or who blocked me.
  3. In one pipeline `SINTERCARD 2 ucomm:{me} ucomm:{b}`; keep those sharing at least one community.
  4. Sort by shared communities then recent activity, limit 12, hydrate from `usr:{id}`.
  5. Return `{id, username, avatarUrl, school, mutualCount, birthdayToday: true}`. **Never** age, date or month.
- "Wish" (`POST /users/:username/wish`): allowed only if the target is opted-in, has a birthday today in their time zone, and shares a community with me; once per pair per day; creates a `birthday_wish` notification (and an optional pre-filled DM draft on the client). Responds `204`.
- Your own card: if it is your birthday and you opted in, the Home hero shows a small "Happy birthday" strip (`isMe: true`), nothing public is added.
- Opt-out removes you from tomorrow's set immediately and from today's set on the next request (the request double-checks the live flag from `usr:{id}`).

### 8.5 Feed ordering
- Announcements: `pinned desc, id desc`.
- Showcase: newest first. Optional "Top this week" uses the formula below.
- Feedback: **Top** `score = (up_count + 2 * comments_count) / (age_hours + 2)^1.2`, recomputed on every vote or comment and by a job every 10 minutes for posts under 7 days old; **New** `id desc`. Ties by id. Status chips (`open`, `planned`, `done`) are set only by moderators.
- Comments: oldest first, one reply level (`parent_id`), cursor on id.
- Reactions are idempotent toggles: `PUT` creates, `DELETE` removes; counts are maintained transactionally.

### 8.6 Global search
`search` keeps `search.docs`, updated by events (`user.updated`, `community.updated`, `asset.created`, `event.created`, `entry.created`, `post.created`, and their deletes).

```
q = NFKC(lowercase(trim(q))), strip leading '#'
if len(q) < 2 → suggestions only (recent searches stay client-side; popular communities from disc:top)
run in parallel, LIMIT 5 per kind, 150 ms budget (return partial if a kind times out):
  users        username LIKE q||'%'  OR  similarity(username, q) > 0.3
  communities  name prefix OR trigram OR tsv   (public, or ones I belong to)
  assets       name prefix, only in communities I belong to
  events       upcoming only, title tsv
  entries      title tsv, in my communities or public
  posts        title tsv, in my communities or public (announcements/showcase/feedback)
rank: 3*prefix + similarity + ts_rank_cd + 0.5*sharedCommunities(for users) + 0.3*verified + 0.2*joined
visibility filter: community_id = ANY(:myCommunityIds) OR visibility = 'public'
mods-only assets and private communities are never indexed for non-members
```

Optional `communityId` scopes the search to one community (used by the mobile assets page search). Response is grouped by kind with highlight offsets. Typo tolerance via trigram only; if the corpus passes ~100k docs, swap in Typesense or Meilisearch behind the same interface.

### 8.7 In-asset message search
`GET /assets/:id/search?q=` is served by `chat`: `websearch_to_tsquery('simple', q)` against the partition GIN indexes, limited to the last 180 days (partition pruning), returns id, author, snippet, time (`ts_headline` capped at 160 chars). Permission-checked, 30 requests per minute.

### 8.8 Campaign leaderboard
- Redis zset `lb:{campaignId}` with composite score `points * 1e9 + (1e9 − secondsSinceCampaignStart)`; ties go to whoever reached the points first. Stays within double precision for points up to 1 000 000.
- On task approval, in one Postgres transaction: set completion `approved`, `participants.points += task.points`, write outbox. A consumer then `ZADD`s. `UNIQUE(task_id, user_id)` makes points awardable exactly once even on retries.
- Tasks with `proof_required` start `pending` and need a moderator decision; self-verifiable tasks (for example "join a community", "RSVP to an event") are approved automatically by event consumers.
- Rank = `ZREVRANK`; top N = `ZREVRANGE`; "my rank" in O(log n).
- On end: snapshot the top 100 into `campaigns.results`, award badges, persist all points, set the zset TTL to 7 days.
- Points and leaderboards exist **only inside campaigns**. There is no global reputation score in v1.

### 8.9 Badge rule engine
`badge_defs.criteria` is JSON such as `{"event":"campaign.task_approved","count":5}`. The `badges` service consumes every event, increments `badge_progress`, and awards when the threshold is met. `PRIMARY KEY(user_id, badge_id)` makes it idempotent. Awarding emits `badge.awarded` (notification, `users.stats.badges++`). Starter set:

| Badge | Trigger |
|---|---|
| Verified student | `user.verified` |
| Early member | among the first 100 accounts |
| Shipped | a project moved to Launched |
| Community builder | owns a community with 25 or more members |
| Helper | 10 support threads marked solved by you |
| Campaign finisher | completed all tasks of one campaign |
| Event regular | RSVP'd going to 5 events |

Users pin up to 5 badges to show in their profile header (`badge_pins`).

### 8.10 Events and calendar files
- Server returns UTC ISO times plus the event's IANA time zone; the client groups into Today, Tomorrow, This week and months in the viewer's zone.
- `.ics` per RFC 5545: `UID={id}@square.app`, `DTSTAMP`, `DTSTART` and `DTEND` in UTC, `SUMMARY`, escaped `DESCRIPTION` (escape `\`, `;`, `,` and newlines), `LOCATION`, `URL`, `STATUS:CANCELLED` when cancelled, `SEQUENCE` equal to the event version, lines folded at 75 octets. Headers: `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename=event.ics`.
- Reminders: zset `evrem` scored by `starts_at − 1h`; a worker pops due items and creates notifications for `going` and `interested` users.
- An event is "past" when `ends_at < now()` (or `starts_at + 2h` when there is no end).

### 8.11 Link previews (SSRF-safe)
`POST /link-preview {url}`:
- Only `http` and `https`; resolve DNS on the server; reject private, loopback, link-local and metadata ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`); connect to the pinned resolved IP (stops DNS rebinding).
- At most 3 redirects, each re-validated; 3 s timeout; 512 KB body cap; accept only `text/html`; read `og:title`, `og:description`, `<title>`; no cookies; custom user agent.
- Cache by URL hash for 24 h. V1 returns `{title, description, domain}` only (no third-party image URLs, so no tracking pixels); an image can be added later through Cloudinary remote fetch.
- Runs in a worker pool so slow sites never block the event loop. 20 per hour per user.

### 8.12 Sending a message (the critical path)
1. Gateway: verify JWT locally, CSRF and `Origin`, rate limit `(user, asset)`.
2. `chat`: `PermissionClient.can(post)` (2 Redis reads), trust-level checks (links allowed? length ≤ 2000), mention parsing and rows (Section 8.17), normalize NFC, strip control and bidi-override characters, reject duplicate floods (same hash 3 times in 30 s).
3. `seq = HINCRBY`; one transaction inserts the message and the outbox row; return `201` with the hydrated author (from `usr:{id}`).
4. Asynchronously: outbox → stream `evt:message.created` → `realtime` (pushes to viewers), `notifications` (mentions, reply target), `discover` (activity counters), `badges`, `search` (nothing).
- Idempotent through `clientMsgId` (a retry returns the original message).
- Edit: author only, marks `edited_at`. Delete: author, moderator or owner; keeps a tombstone (`"message deleted"`) so reply lines stay valid. Reply: `reply_to_id` must be in the same asset.
- Support asset: the author or a moderator can mark the thread's root message `solved` (adds a green chip) and it emits `support.solved` (feeds the Helper badge).
- Server budget for this endpoint: under 60 ms.

### 8.13 Direct-message rules
```
canDM(a → b):
  blocked either way                      → 403 dm_blocked   ("You can't message this user")
  b.dm_privacy = none                     → 403 dm_closed
  b.dm_privacy = shared (default)         → need SINTERCARD ucomm:a ucomm:b >= 1, or an existing conversation
  new conversation limits                 → trust 0: 5/day, trust 1+: 20/day
  message request                         → until b replies, a can send at most 3 messages (then 429 dm_request_limit)
conversation key = min(userA,userB) + ':' + max(userA,userB)   // unique, so find-or-create is race-free (INSERT ... ON CONFLICT)
```
Blocking hides the conversation for both, removes each other from search, suggestions and mutuals, and keeps history for moderation requests only.

### 8.14 Batch hydration (no N+1)
List endpoints return embedded authors. After fetching rows, collect distinct author ids, `MGET usr:{id}…`; misses go to one internal batch call (`users: POST /internal/users/batch`, max 100) and are cached. Never one call per row.

### 8.15 Moderation and anti-abuse
- Reports create `moderation.reports`; community moderators see their community's reports; platform admins see everything.
- Actions: delete content, timeout (mute for a duration), kick, ban (with reason and optional expiry). Each writes to `audit_log` (append-only) and emits events so caches (`perm:*`, `ucomm:*`) are invalidated immediately.
- Abuse signals feed the trust level: reports upheld, duplicate floods, rate-limit hits, link spam. Repeated signals drop trust to 0 automatically.
- Mod powers are scoped per community; nobody can act on an equal or higher role; owner transfer requires re-authentication by email code.

### 8.16 Reactions
Every message and reply in chat assets and DMs can carry reactions. Feed posts keep their own like and upvote (Section 8.5).
- **Validation:** only allowlisted Unicode emoji from `shared` (generated from the Unicode emoji list: fully-qualified sequences including skin tones), at most 32 bytes, text-presentation forms rejected, no custom emoji in v1. Error `emoji_not_allowed`.
- **Limits:** at most 20 distinct emoji per message and 10 reactions per user per message (`reaction_limit_reached`).
- **Add** (`PUT`) is idempotent: in one transaction `INSERT INTO reactions ... ON CONFLICT DO NOTHING RETURNING 1`; only if a row was inserted, upsert `reaction_counts` (`count = count + 1`, `first_at` set on first insert) and write the outbox row. **Remove** deletes the row and decrements, deleting the count row at 0. Both return `204` and are no-ops when already in that state.
- **Reading:** message list queries return `reactions: [{emoji, count, me}]` ordered by `first_at`, never by count. Two indexed lookups per page: counts `WHERE message_id = ANY($ids)` and my rows `WHERE user_id = $me AND message_id = ANY($ids)`. No GROUP BY at read time, no N+1. A message with no reactions has an empty array and the UI shows only the add button.
- **Who reacted:** `GET /messages/:id/reactions/:emoji/users?cursor=` keyset on `(created_at, user_id)`, blocked users filtered, user cards by batch hydration.
- **Permissions:** add or remove needs `A:post` on the asset (read-only users and non-members get `asset_forbidden`); in DMs both participants and no block (`dm_blocked`); timed-out or banned users cannot react; tombstoned messages reject reactions (`not_found`).
- **Moderation:** moderators can clear one emoji or all reactions on a message; each action writes an audit log row.
- **Realtime:** `reaction.updated {scope, roomId, messageId, emoji, count, op, userId}` goes only to viewers of that asset room (hot-room model) or the two DM participants; a `resync` restores counts after a reconnect gap.
- **Notifications:** off by default (`ENABLE_REACTION_NOTIFICATIONS=false`); when on, aggregated ("#tunde and 3 others reacted") at most once per message per 10 minutes.
- **Anti-abuse:** trust level 0 is limited to 20 reactions per minute; bursts above 5 per 3 seconds are rejected with `rate_limited`.

### 8.17 Mentions (tags)
- **Parsing (server side, on message create and edit):** tokens `@username` (same character rules as usernames) outside code spans. Resolve against people who can read the asset (or the DM partner). Ignore self mentions, unknown names, non-readable users and blocked users. At most 5 distinct mentions: the 6th and later are ignored and the request is not failed (trust level 0: at most 2). The stored message keeps the text unchanged.
- **Rows:** in the same transaction as the message, insert one `mentions` row per mentioned user, bump `ment:{userId}`, and write the outbox event `mention.created {userId, assetId, messageId, seq}`. On edit, only NEW mentions create rows and notifications.
- **Unread summaries** return `{unread, mentions}` (Section 8.1); inbox kind `mention` goes to the notifications service.
- **Seen rules:** `GET /assets/:id/mentions?unread=true` returns the unseen mentions (`messageId`, `seq`, `createdAt`) so the client can show a jump button above the send button when a tagged message is outside the visible area. The client reports mentions as seen when the message was visible for 600 ms or after a jump, and reports all as seen when the user leaves the asset or DM (`POST .../mentions/seen {all:true}`, safe to send with `sendBeacon`). Opening a chat never marks mentions seen and never highlights the tagged row.
- **Autocomplete:** `GET /assets/:id/mentionable?q=&limit=&cursor=` returns members who can read that asset (mods-only returns only owners and moderators), excluding the caller and anyone who blocked or is blocked by the caller. An empty `q` returns everyone: first the people who spoke recently in that asset (Redis zset `act:{assetId}`, last 200 speakers), then the rest alphabetically; with `q`, prefix matches first (`username LIKE q||'%'`), then trigram contains. Keyset pagination on `(rank, id)`, user cards by batch hydration, 150 ms budget. DMs: `GET /dm/conversations/:id/mentionable` returns only the other participant.

---

## 9. Speed playbook

**Database**
- Every hot query has a documented index. CI runs `EXPLAIN` on the hot-query list and fails on a sequential scan of a table over 10k rows.
- Keyset pagination only. Select only needed columns. `LIMIT n+1` to detect "has more". Batch inserts. No `COUNT(*)` on request paths (counters are stored and corrected by a nightly reconcile job).
- Partition `chat.messages` and `dm.dm_messages` monthly (`pg_partman`); old partitions can be moved to cheaper storage.
- Use the Supabase pooler in transaction mode; the `pg` client must not use named prepared statements. Pool sizes: 4 to 6 per service process; keep the total under the plan's connection limit (write the budget in `docs/runbooks/db-connections.md`).
- Read replicas later for `discover` and `search` queries.

**Redis**
- Pipelines and `MGET` everywhere, Lua for rate limits and atomic counters, no `KEYS`, only `SCAN` in maintenance jobs.
- Jittered TTLs (±10%) and single-flight loaders so a cache expiry never stampedes Postgres.

**Caching map**

| Data | Where | TTL |
|---|---|---|
| `/schools`, `/interests`, `/asset-catalog`, `/config` | CDN + ETag | 1 day |
| Public community page and about | CDN | 30 s |
| Explore lists | Redis | 60 s |
| Home aggregate per user | Redis | 60 s (people 1 h, birthdays 10 min) |
| Public profile fields | Redis | 30 s |
| Assets list of a community | Redis | 10 min, invalidated by events |
| Unread and messages | not cached | live |

**Node and HTTP**
- Fastify with response schemas generated from zod so JSON is serialized with `fast-json-stringify`. HTTP/2 or HTTP/3 and Brotli at Cloudflare, gzip for bodies over 1 KB at origin.
- Event loop lag is a metric (alert at 50 ms). CPU-heavy work (link preview parsing, ICS for large calendars, image checks) runs in worker threads.
- Graceful shutdown (drain, finish in-flight, close pools). Keep-alive pools between services.
- Payload budgets: a message page of 30 is under 25 KB; the Home aggregate is under 40 KB; no HTML in any response.

**Network**
- Put compute, Postgres and Redis in the same cloud region, picked by measuring round-trip from Lagos (compare a European region and Cape Town before deciding). Cloudflare has a Lagos edge for TLS and static caching.
- Weak mobile data: ETags, slim projections, optional `?expand=` for heavy fields, cursor pagination with small first pages.

**Gates**
- k6 scenarios: login burst (200 users/min), a chat room with 500 viewers and 5 messages/s, Home at 200 rps, 5 000 concurrent SSE connections, search at 100 rps. The nightly job fails the build when p95 exceeds Section 2.1 targets.

---

## 10. Security playbook

**Edge and gateway**
- Cloudflare in front: TLS 1.3, HSTS (preload), WAF managed rules, bot protection, rate limiting at the edge, origin locked to Cloudflare's ranges.
- Strict CORS: only the Square web origin(s), credentials allowed, no wildcards. Security headers via helmet (CSP for any HTML the API serves, `X-Content-Type-Options`, `Referrer-Policy`). JSON body limit 64 KB (uploads never pass through the API). `Content-Type` must be `application/json`. Per-route timeouts (default 5 s).
- The gateway strips any incoming `x-user` header and sets its own signed one.

**Authentication and authorization**
- Section 5. Default deny; every handler declares the permission it needs and a test enforces it. All queries filter by community membership or ownership in SQL, never only in code.
- **Authorization matrix test, generated from the endpoint table (Section 15):** for every endpoint, the test calls it as anonymous, non-member, member, moderator, owner and blocked user and asserts the exact expected status. A new endpoint without a row fails CI.

**Input and output**
- zod strict schemas at every boundary: unknown fields rejected, string max lengths, enum whitelists, URL validation (`https` only for user links and media), NFC normalization, control and bidi-override characters stripped.
- SQL only through Kysely with parameters. Sorting and filtering fields come from a whitelist, never from client strings.
- The API returns JSON only. Message, bio and post text is stored as plain text with a restricted markdown subset; the client renders it with a sanitizer. Any link in user content is rendered with `rel="noopener noreferrer nofollow"`.

**Uploads**
- Direct to Cloudinary using a short-lived signature bound to: folder `square/{env}/{kind}/{userId}`, allowed formats (jpg, png, webp, gif for images; mp4 for short video), max bytes per kind (avatar 2 MB, banner 5 MB, post media 20 MB), a fixed upload preset. The signature response is verified server-side on `POST /uploads/complete` (signature check on Cloudinary's response plus `public_id` prefix check). No SVG. EXIF and GPS stripped. Orphan uploads (never completed) are deleted after 24 h.

**Secrets, supply chain, runtime**
- Secrets only in environment variables, separate per environment, rotated; `gitleaks` in CI and a pre-commit hook.
- Lockfile committed, dependency audit and Renovate, SBOM, pinned base image digests, distroless non-root images, read-only filesystem where possible.
- Postgres: SSL required, no public endpoint, per-service roles with least privilege, RLS on, PITR backups enabled, `date_of_birth` column-level access revoked for all but two roles.
- Redis: private network, TLS and ACL users per service limited to their key prefixes.
- Service-to-service: private network plus signed service tokens (Section 5.3). Only the gateway and realtime accept public traffic.

**Abuse and detection**
- Layered rate limits (Section 14) keyed by user, IP and device. Velocity rules (many accounts from one IP, many DMs to strangers, link-heavy new accounts) lower trust level or block.
- New-device login emails; `logout-all` revokes sessions instantly.
- Logs never contain tokens, codes, cookies or raw emails (hash them); retention 30 days; audit log is append-only.

**Threats to design against explicitly**

| Threat | Control |
|---|---|
| Token theft | short access token, refresh rotation with reuse detection, `__Host-` cookies, session list |
| IDOR on assets, messages, DMs | membership-scoped SQL, matrix test |
| Private community or mods-only leaking via search, discover, notifications or SSE | visibility filter at index time and query time, per-event permission re-check in realtime |
| DOB or birthday leakage | DOB never returned, only a boolean for opted-in users, column grants |
| Account and email enumeration | uniform auth responses, uniform timing, rate-limited availability endpoint |
| DM spam and harassment | DM privacy, shared-community default, message requests, blocks, trust levels |
| SSRF through link preview | Section 8.11 |
| XSS in messages, bios, links | plain-text storage, sanitizer on render, https-only links |
| Points double spend, double RSVP, duplicate messages | unique constraints and idempotency keys |
| Rate-limit bypass by IP rotation | limits also keyed by user and device |
| Email cost abuse | per email and per IP caps, queue, provider alerts |
| SSE exhaustion | 3 streams per user, per-IP cap, backpressure |
| Malicious moderator | audit log, owner alerts on bulk actions, owner-only transfer and delete |
| Reaction spam and count inflation | unique key, per-message and per-user limits, rate limits, trust levels |
| Mention spam and harassment | max 5 per message, rate limits, blocks respected in parsing and autocomplete, trust-level cap |

**Before launch:** external penetration test, a dry-run incident response (token leak, DB leak), a documented kill switch (`SIGNUP_ENABLED`, `DM_ENABLED`, `UPLOADS_ENABLED`).

---

## 11. Privacy and data protection (NDPA 2023)

- Lawful basis is consent at signup plus contract for the service. Collect only what is needed: email, username, school, date of birth (used for the age gate and the optional birthday feature only).
- Minimum age is an open decision (O1). It is enforced server-side from the date of birth with a generic message.
- **Data export:** `POST /me/export` starts an async job and emails a signed link that expires in 24 h (JSON of profile, memberships, content, DMs the user sent).
- **Deletion:** `DELETE /me` starts a 7-day grace period (login cancels it). Then: profile fields removed, username replaced with `deleted-user-xxxx`, avatar and banner deleted from Cloudinary, DMs sent by the user have bodies removed, community messages kept but shown as "Deleted user". Sessions revoked, blocks removed, search docs removed.
- Retention: login events 90 days, logs 30 days, soft-deleted content bodies wiped after 30 days, audit log 2 years.
- User controls: birthday opt-in, appear offline, show communities, DM privacy (`everyone | shared | none`), notification levels per community and asset, block list.
- Third parties documented in the privacy policy: Supabase (database), Cloudinary (media), the email provider, Cloudflare, the hosting provider.

---

## 12. Operations

### 12.1 Environments and config
`local`, `staging`, `prod`. Config is read from environment variables and validated with zod at boot (the process refuses to start on invalid config). Backend feature flags: `SERVICES` (profile), `TRANSPORT`, `ENABLE_TYPING`, `ENABLE_PUSH`, `ENABLE_REACTION_NOTIFICATIONS`, `COOKIE_DOMAIN`, `WEB_ORIGINS`, `SERVICES_PROFILE`, `SIGNUP_ENABLED`, `DM_ENABLED`, `UPLOADS_ENABLED`, `SIGNUP_REQUIRE_SCHOOL_EMAIL`.

### 12.2 Observability
- Logs: pino JSON with `requestId`, `traceId`, `userId` (hashed), `service`, `route`, `ms`.
- Metrics: RED per route (rate, errors, duration), event-stream lag, outbox backlog, DB pool use, Redis memory and hit rate, event-loop lag, SSE connections.
- Tracing: W3C `traceparent` from the gateway through every call and event; OpenTelemetry sampled 5%.
- SLOs: availability 99.9%, p95 targets from Section 2.1. Alerts: p95 breach for 5 minutes, 5xx over 1%, stream lag over 5 s, outbox backlog over 1 000, Redis memory over 75%, DB connections over 80%, login-failure spike, email bounce spike, unusual 429 rate.
- Health: `/healthz` (liveness), `/readyz` (Postgres and Redis reachable), `/metrics` (internal only).

### 12.3 Deployment
Docker image per deployable, built only when the service or the shared packages change. Staging then production with a smoke test between. Rolling deploys with connection draining (SSE clients reconnect with `Last-Event-ID`). Hosting suggestion for the pilot: containers on Fly.io, Railway or Render, managed Redis with Streams support (Redis Cloud or self-hosted on the same platform), Supabase, Cloudflare, Cloudinary. The `pilot` profile (6 small instances) is enough for the first campus.

**Launch profile and Pxxl.** The first deployment uses the `launch` profile: `launch-api` (gateway plus every REST service in one process), `launch-realtime` (SSE streams, kept apart because connections are long-lived) and `launch-worker` (outbox relays, consumers, scheduled jobs; only if the host can run a non-web process), plus the frontend. Postgres is Supabase, Redis must support Streams (Redis Cloud, Upstash or similar), media is Cloudinary and email is Resend. Before relying on the host, run the capability test in `docs/DEPLOY.md` (build from a subfolder, `PORT` binding, a 5-minute SSE connection with 25 s heartbeats, outbound access to Postgres and Redis, a second app or worker, custom domain and subdomains, secrets, sleep behavior). If the host fails the SSE or worker checks, keep the frontend there and run `launch-api`, `launch-realtime` and `launch-worker` on a host with always-on processes; nothing else changes. Use a custom domain with `COOKIE_DOMAIN` (Section 5.3) so the web app, API and stream share cookies.

### 12.4 Data safety
Supabase point-in-time recovery on, weekly restore drill. Migrations are expand/contract (add, backfill, switch, drop later), backward compatible with the previous release, run by CI before the deploy, in per-schema folders.

### 12.5 Rebuilding Redis from Postgres
Everything in Redis except in-flight stream entries and rate-limit counters is derived. `pnpm rebuild:redis [--only perm,asset,ucomm,cmem,seq,reads,disc,bday]` repopulates from Postgres: `seq` from `max(seq)` per asset, `reads` from `asset_reads`, `ucomm` and `perm` from `members`, `disc` by running the jobs. Services lazy-fill missing keys on read, and fall back to Postgres (slower, still correct) when Redis is down, with `degraded=true` in `/readyz`.

### 12.6 Testing
- Unit tests for algorithms (ranking, cursor, ICS, username rules, SSRF guard, leaderboard scoring).
- Integration tests with Testcontainers (real Postgres and Redis) per service.
- Contract tests: zod schemas in `shared` are the contract; OpenAPI is generated from them; the frontend's typed client is generated from the same OpenAPI.
- Authorization matrix test (Section 10).
- Chaos checks in CI nightly: kill Redis (the app degrades), kill one service (the gateway circuit-breaks that feature only and returns `503` with `Retry-After`).
- k6 load gates (Section 9). End-to-end Playwright suite against the real backend after the frontend swaps off mocks.

### 12.7 CI/CD
GitHub Actions on every PR: lint, typecheck, unit, integration (affected services only), migration dry run, OpenAPI diff (breaking-change check), gitleaks, dependency audit, container build, deploy to staging on merge, smoke, manual promote to production.

---
## 13. Event catalog

Envelope for every event (Redis Stream `evt:{type}`, consumer groups per consuming service, at-least-once, consumers are idempotent):

```json
{ "id": "01J…", "type": "member.joined", "v": 1, "ts": "2026-11-21T04:30:00Z",
  "actor": "userId|system", "traceId": "…", "data": { } }
```

Rules: events carry the ids and the few fields consumers need (no secrets, no DOB); a consumer that cannot handle an event twice is a bug; poison events go to `evt:dead` after 5 tries with an alert; schemas live in `shared/events.ts` and are versioned (`v`).

| Event | Producer | Consumers |
|---|---|---|
| `user.created` | users | badges (Early member), search, discover, notifications (welcome) |
| `user.updated` | users | search, discover, redis cache refresh (`usr:*`), realtime |
| `user.verified` | users | badges (Verified student), notifications |
| `user.deleted` | users | all services (anonymize or remove), search |
| `user.blocked` / `user.unblocked` | users | dm, discover, search caches |
| `community.created` | communities | assets (create four defaults), search, discover |
| `community.updated` | communities | search, discover |
| `community.deleted` | communities | assets, chat, feeds, events, lists, boards, campaigns, search |
| `member.joined` | communities | chat (set read cursor), discover (counters, `ucomm`/`cmem`), badges, notifications, realtime |
| `member.left` | communities | discover, realtime, caches (`perm:*`, `ucomm:*`) |
| `member.role_changed` | communities | caches, realtime (`role.changed`), audit |
| `member.banned` / `member.timeout` | moderation / communities | caches, realtime, audit |
| `asset.created` / `asset.updated` / `asset.removed` | assets | caches (`asset:*`, `assets:*`), search, realtime |
| `rules.updated` | assets | notifications (optional), cache |
| `message.created` | chat | realtime, notifications (mentions, replies), discover (activity), badges |
| `message.deleted` / `message.edited` / `message.pinned` | chat | realtime |
| `support.solved` | chat | badges (Helper), notifications |
| `dm.message.created` | dm | realtime, notifications |
| `post.created` / `post.updated` / `post.deleted` | feeds | search, realtime, notifications (announcements opt-in), discover |
| `comment.created` | feeds | notifications (post author), realtime |
| `reaction.toggled` | feeds / chat / dm | audit, badges, feeds score recompute |
| `reaction.updated` | chat / dm | realtime (viewers of the room or the two DM participants) |
| `mention.created` | chat / dm | notifications (inbox, counters), realtime (`unread.bump` with `mention`) |
| `event.created` / `event.updated` / `event.cancelled` | events | search, notifications, reminders, realtime |
| `rsvp.changed` | events | badges (Event regular), campaigns (auto tasks) |
| `entry.created` / `entry.saved` | lists | search, notifications (mods optional) |
| `item.created` / `item.stage_changed` | boards | search, badges (Shipped), notifications |
| `item.join_requested` / `item.join_decided` | boards | notifications |
| `campaign.created` / `campaign.ended` | campaigns | notifications, badges, search |
| `task.completed` / `task.approved` | campaigns | leaderboard update, badges, notifications |
| `badge.awarded` | badges | users (stats), notifications, realtime |
| `report.created` | moderation | notifications (mods) |
| `upload.ready` | media | users (avatar/banner), feeds, events |

---

## 14. Rate limits

Token bucket or sliding window implemented once in the kernel as a Redis Lua script. Keys combine user id, IP and (for anonymous) device fingerprint. All limits are configuration, not code. Cloudflare applies a coarse IP limit first.

| Family | Limit | Key |
|---|---|---|
| `POST /auth/request-code` | 5/h per email, 10/h per IP, 60 s cooldown | email hash, IP |
| `POST /auth/verify-code` | 10 per 15 min per email and per IP; code dies after 5 wrong | email hash, IP |
| `POST /auth/refresh` | 30/min | session |
| `GET /users/username-available` | 30/min | user or IP |
| Read endpoints (default) | 300/min per user | user |
| Write endpoints (default) | 60/min per user | user |
| `POST /assets/:id/messages` | 8 per 10 s per asset, 60/min overall (trust 0: 3/min) | user, asset |
| `POST /dm/conversations/:id/messages` | 10 per 10 s, 100/min | user |
| New DM conversations | 20/day (trust 0: 5/day) | user |
| Reactions (add and remove) | 60/min, burst 5 per 3 s (trust 0: 20/min) | user |
| RSVP, saves | 60/min | user |
| Who reacted, mentions seen | 60/min | user |
| Mention autocomplete | 120/min | user |
| Posts, entries, items, events | 10/h per asset, 40/day | user |
| Comments | 20/min | user |
| `POST /link-preview` | 20/h | user |
| `GET /search`, `/search/suggest` | 60/min | user |
| `GET /assets/:id/search` | 30/min | user |
| `POST /uploads/sign` | 20/h | user |
| `POST /reports` | 10/h | user |
| Typing | 1 per 3 s | user, room |
| `GET /me/stream` | 3 concurrent, 10 connects/min | user, IP |
| `POST /users/:username/wish` | 1 per pair per day | user pair |
| `POST /communities` | 3 owned total, 2/day | user |

Responses: `429` with `Retry-After` and the error code `rate_limited`. Never silently drop.

---

## 15. API endpoints

Base `/v1`. The gateway routes by prefix. Legend for the Access column:

- **P** public (no login) · **U** signed-in user · **Self** the owner of the resource
- **A:read / A:post / A:manage** the permission on the asset (Section 4.2); for non-members of public communities `A:read` allows read-only preview
- **C:member / C:mod / C:owner** role in the community
- **Author** the author of the item, or C:mod and C:owner
- **Int** internal service-to-service only (never exposed by the gateway)

### 15.1 Gateway (`gateway`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/config` | P | Constants the frontend needs: limits, asset catalog version, feature flags, minimum username length, max lengths. Cacheable 1 day |
| GET | `/me/bootstrap` | U | One call at app start: `me`, communities strip with unread, DM unread total, notification count, settings. Aggregates `users`, `communities`, `chat`, `dm`, `notifications` with a hard 150 ms budget |
| GET | `/home` | U | Home dashboard aggregate (calls `discover`; partial results allowed per tile) |
| GET | `/healthz`, `/readyz`, `/metrics` | Int | Liveness, readiness, Prometheus |

### 15.2 Auth (`auth`)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/request-code` | P | `{email}` → `202 {ok:true}` always |
| POST | `/auth/verify-code` | P | `{email, code}` → existing account: session and `{isNewUser:false, user}`; new email: `{isNewUser:true, signupTicket}` |
| POST | `/auth/signup` | P (ticket) | `{signupTicket, username, schoolId, educationStatus, dateOfBirth}` → session and `{user}` |
| POST | `/auth/refresh` | P (refresh cookie) | Rotates the refresh token |
| POST | `/auth/logout` | U | Revokes this session |
| POST | `/auth/logout-all` | U | Revokes all sessions |
| GET | `/auth/sessions` | U | Devices list |
| DELETE | `/auth/sessions/:id` | Self | Revoke one device |

Both the `/login` and `/signup` screens use exactly these endpoints (Section 5.1). Auth response user cards include only the server-computed `profileComplete` routing hint in addition to public user fields; email and DOB are never returned.

### 15.3 Users (`users`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/users/username-available?u=` | P | `{available}` |
| GET | `/schools?q=` | P | Searchable list, cacheable |
| GET | `/interests` | P | Interest tags, cacheable |
| GET | `/me` | U | Own full profile (never includes DOB, only `birthdayOptIn`) |
| PATCH | `/me` | U | Bio, status, interests, skills, department, level, location, languages, links, avatar/banner (`uploadId`), featured project, privacy |
| GET | `/me/settings` | U | Privacy and preferences |
| PATCH | `/me/settings` | U | `birthdayOptIn`, `appearOffline`, `showCommunities`, `dmPrivacy`, `timezone` |
| POST | `/me/export` | U | Starts an export job |
| DELETE | `/me` | U | Starts deletion with a 7-day grace |
| POST | `/me/delete/cancel` | U | Cancels deletion |
| GET | `/users/:username` | U | Public profile: bio, status, school, department, level, interests, skills, links, banner, avatar, stats, `inCommonCount`, presence, relation flags (`blockedByMe`, `blockedMe`), pinned badges, featured project. No DOB, no email |
| GET | `/users/:username/card` | U | Slim card for profile popovers: avatar, banner, status, school, department, pinned badges, `inCommonCount`, presence, relation flags (no bio, no links) |
| GET | `/users/:username/communities` | U | Public communities plus ones in common, honoring `showCommunities` |
| GET | `/users/:username/badges` | U | Earned badges with dates (own profile also locked ones with progress) |
| GET | `/users/:username/projects` | U | Projects from `boards`, public only |
| GET | `/users/:username/activity` | U | Timeline of public events (joined, badge, shipped, campaign) |
| GET | `/users/:username/in-common` | U | Shared communities and interests |
| GET | `/me/blocks` | U | Blocked users |
| PUT | `/users/:username/block` | U | Block |
| DELETE | `/users/:username/block` | U | Unblock |
| POST | `/users/:username/wish` | U | Birthday wish (Section 8.4), 204 |
| POST | `/internal/users/batch` | Int | `{ids[≤100]}` → slim user cards |

### 15.4 Badges (`badges`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/badges` | U | All badge definitions |
| GET | `/badges/:slug` | U | Details and my progress |
| GET | `/me/badges` | U | Earned and locked with progress |
| PUT | `/me/badge-pins` | U | `{badgeIds[≤5]}` shown in profile header |

### 15.5 Communities (`communities`)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/communities` | U (trust ≥ 1) | Creates a community and its four default assets |
| GET | `/communities/:slug` | U (public or member) | Name, description, counts, my role, join policy, visibility |
| GET | `/communities/:slug/about` | U (public or member) | Banner, description, category, school, owners and mods, created date |
| PATCH | `/communities/:slug` | C:owner | Edit name, description, images, visibility, join policy, category |
| DELETE | `/communities/:slug` | C:owner | Soft delete (re-auth with email code) |
| POST | `/communities/:slug/join` | U | Open: join now; request: creates a join request; invite-only: 403 `invite_required` |
| DELETE | `/communities/:slug/membership` | C:member | Leave (owner must transfer first) |
| DELETE | `/communities/:slug/join-request` | U | Cancel my pending request |
| GET | `/me/communities` | U | Strip: ordered list with icon, role, unread summary |
| PUT | `/me/communities/order` | U | `{ids[]}` reorder strip |
| GET | `/communities/:slug/members?q=&role=&cursor=` | U (member; public preview shows counts only) | Member list, search by username |
| PATCH | `/communities/:slug/members/:userId` | C:owner | Set role `moderator` or `member` |
| DELETE | `/communities/:slug/members/:userId` | C:mod | Kick (not equal or higher role) |
| POST | `/communities/:slug/transfer-ownership` | C:owner | `{userId, code}` re-auth with email code |
| GET | `/communities/:slug/bans` | C:mod | Ban list |
| POST | `/communities/:slug/bans` | C:mod | `{userId, reason, until?}` |
| DELETE | `/communities/:slug/bans/:userId` | C:mod | Unban |
| GET | `/communities/:slug/join-requests` | C:mod | Pending requests |
| POST | `/communities/:slug/join-requests/:id/decision` | C:mod | `{approve:boolean}` |
| GET | `/communities/:slug/invites` | C:mod | Active invites |
| POST | `/communities/:slug/invites` | C:mod | `{maxUses?, expiresIn?}` → link code |
| DELETE | `/communities/:slug/invites/:code` | C:mod | Revoke |
| GET | `/invites/:code` | P | Preview (name, icon, member count) |
| POST | `/invites/:code/accept` | U | Join through the invite |

### 15.6 Assets (`assets`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/asset-catalog` | U | The fixed suggestion list for the "+" dialog, with categories and who can add |
| GET | `/communities/:slug/assets` | U (public or member) | Grouped by category (Information, Community, Resources, Build) with kind, lock state, `unread`, `mentions`; only assets the caller can read |
| POST | `/communities/:slug/assets` | C:mod | `{catalogKey}`; no custom assets in v1 (`ALLOW_CUSTOM_ASSETS=false`) |
| GET | `/communities/:slug/assets/:key` | A:read | Resolves a URL like `/c/web3-club/general` to an asset |
| PATCH | `/assets/:id` | A:manage | Topic and description; permission thresholds only for C:owner |
| DELETE | `/assets/:id` | C:mod | Not allowed for default assets (`asset_protected`) |
| PUT | `/communities/:slug/assets/order` | C:mod | Reorder within categories |
| GET | `/assets/:id/rules` | A:read | Guidelines: numbered rules and version |
| PUT | `/assets/:id/rules` | A:manage | Replace the set `{rules[], version}` (optimistic with `version`) |
| GET | `/communities/:slug/rules/agreement` | U | `{agreedAt?, version}` |
| POST | `/communities/:slug/rules/agree` | C:member | "I have read and agree" |

### 15.7 Chat (`chat`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/assets/:id/messages?before=&after=&around=&limit=` | A:read | Newest first by default; `around` for deep links; embedded authors and reply previews |
| POST | `/assets/:id/messages` | A:post | `{body, replyToId?, clientMsgId}` → 201 |
| GET | `/messages/:id` | A:read | Single message (jump to reply) |
| PATCH | `/messages/:id` | Author (edit: author only) | `{body}` |
| DELETE | `/messages/:id` | Author | Tombstone |
| PUT | `/messages/:id/reactions/:emoji` | A:post | Add my reaction (idempotent); limits 20 distinct emoji per message, 10 per user per message |
| DELETE | `/messages/:id/reactions/:emoji/me` | A:post | Remove my reaction |
| GET | `/messages/:id/reactions/:emoji/users?cursor=` | A:read | Who reacted (paged, blocked users hidden) |
| DELETE | `/messages/:id/reactions/:emoji` | C:mod | Clear that emoji from the message |
| DELETE | `/messages/:id/reactions` | C:mod | Clear all reactions of the message |
| GET | `/assets/:id/mentions?unread=true` | C:member | My unseen mentions in this asset: `[{messageId, seq, createdAt}]` |
| POST | `/assets/:id/mentions/seen` | C:member | `{messageIds[] | all:true}`; safe with sendBeacon when leaving |
| GET | `/assets/:id/mentionable?q=&limit=&cursor=` | A:post | Taggable members (everyone when `q` is empty) |
| GET | `/assets/:id/pins` | A:read | Pinned messages |
| PUT | `/messages/:id/pin` | C:mod | Pin |
| DELETE | `/messages/:id/pin` | C:mod | Unpin |
| POST | `/messages/:id/solve` | Author or C:mod | Support asset only; marks the thread solved |
| DELETE | `/messages/:id/solve` | Author or C:mod | Unmark |
| POST | `/assets/:id/read` | C:member | `{seq}` advances my read cursor |
| GET | `/assets/:id/search?q=` | A:read | In-asset message search |
| POST | `/assets/:id/typing` | A:post | Behind `ENABLE_TYPING` |

### 15.8 Direct messages (`dm`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/dm/conversations?cursor=` | U | My conversations: other user card, last message preview, unread, muted, presence |
| POST | `/dm/conversations` | U | `{username}` find or create; applies Section 8.13 rules |
| GET | `/dm/conversations/:id` | Participant | Metadata and the other user's card |
| PATCH | `/dm/conversations/:id` | Participant | `{muted?, archived?, hidden?}` |
| GET | `/dm/conversations/:id/messages` | Participant | Cursor paged, embedded reply previews |
| POST | `/dm/conversations/:id/messages` | Participant | `{body, replyToId?, clientMsgId}` |
| PATCH | `/dm/messages/:id` | Author | Edit |
| DELETE | `/dm/messages/:id` | Author | Tombstone |
| POST | `/dm/conversations/:id/read` | Participant | `{seq}` |
| POST | `/dm/conversations/:id/typing` | Participant | Behind `ENABLE_TYPING` |
| PUT | `/dm/messages/:id/reactions/:emoji` | Participant | Add my reaction (no block between the two) |
| DELETE | `/dm/messages/:id/reactions/:emoji/me` | Participant | Remove my reaction |
| GET | `/dm/messages/:id/reactions/:emoji/users?cursor=` | Participant | Who reacted |
| GET | `/dm/conversations/:id/mentions?unread=true` | Participant | Unseen mentions |
| POST | `/dm/conversations/:id/mentions/seen` | Participant | `{messageIds[] | all:true}` |
| GET | `/dm/conversations/:id/mentionable` | Participant | The other participant only |

### 15.9 Feeds (`feeds`): announcements, showcase, feedback

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/assets/:id/posts?sort=top|new&status=&cursor=` | A:read | Pinned first (announcements) |
| POST | `/assets/:id/posts` | A:post | `{title, body, mediaIds[], pin?, commentsEnabled?}` |
| GET | `/posts/:id` | A:read | Post with counts and my reaction |
| PATCH | `/posts/:id` | Author | Edit; `If-Match` version |
| DELETE | `/posts/:id` | Author | Soft delete |
| PUT | `/posts/:id/pin` | C:mod | Pin |
| DELETE | `/posts/:id/pin` | C:mod | Unpin |
| PUT | `/posts/:id/status` | C:mod | `open | planned | done` (feedback only) |
| PUT | `/posts/:id/reaction` | C:member | `{type: like|up}` idempotent |
| DELETE | `/posts/:id/reaction` | C:member | Remove |
| GET | `/posts/:id/comments?cursor=` | A:read | Oldest first |
| POST | `/posts/:id/comments` | C:member | `{body, parentId?}`; 403 if comments disabled |
| DELETE | `/comments/:id` | Author | Soft delete |
| POST | `/link-preview` | U | SSRF-safe (Section 8.11) |

### 15.10 Events (`events`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/assets/:id/events?scope=upcoming|past&cursor=` | A:read | Sorted by start; cancelled included with status |
| POST | `/assets/:id/events` | A:post | `{title, startsAt, endsAt?, timezone, place?, onlineUrl?, description, coverUploadId?}` |
| GET | `/events/:id` | A:read | Full event, my RSVP, counts |
| PATCH | `/events/:id` | A:manage | Edit; `version` bumps for `.ics` |
| POST | `/events/:id/cancel` | A:manage | Marks cancelled and notifies attendees |
| PUT | `/events/:id/rsvp` | C:member | `{state: going|interested|not_going}` |
| DELETE | `/events/:id/rsvp` | C:member | Clear |
| GET | `/events/:id/attendees?state=&cursor=` | A:read | Avatars list |
| GET | `/events/:id/calendar.ics` | A:read | Calendar file (Section 8.10) |
| GET | `/me/events` | U | My upcoming RSVPs and upcoming events in my communities |

### 15.11 Lists (`lists`): resources and opportunities

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/assets/:id/entries?q=&tag=&sort=new|saved|deadline&status=&cursor=` | A:read | Deadline sort only for opportunities |
| POST | `/assets/:id/entries` | A:post | `{title, url, description, tags[], deadlineAt?}` |
| GET | `/entries/:id` | A:read | Full entry |
| PATCH | `/entries/:id` | Author | Edit |
| DELETE | `/entries/:id` | Author | Soft delete |
| PUT | `/entries/:id/pin` | C:mod | Pin |
| DELETE | `/entries/:id/pin` | C:mod | Unpin |
| PUT | `/entries/:id/save` | C:member | Save (idempotent) |
| DELETE | `/entries/:id/save` | C:member | Unsave |
| GET | `/entries/:id/savers?cursor=` | C:member | Who saved it |
| GET | `/me/saved?cursor=` | U | My saved entries across communities |

### 15.12 Boards (`boards`): projects and hackathons

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/assets/:id/items?stage=&cursor=` | A:read | Cards for the columns |
| POST | `/assets/:id/items` | A:post | `{title, blurb, description, why, needs[], stage}` |
| GET | `/items/:id` | A:read | Detail: description, stage, milestones count, team, needs |
| PATCH | `/items/:id` | Owner of item | Edit; `version` check |
| DELETE | `/items/:id` | Owner of item or C:mod | Soft delete |
| POST | `/items/:id/stage` | Owner of item | `{stage}` valid for the asset (Idea, Building, Launched / Looking for team, Team formed, Submitted); emits `item.stage_changed` |
| GET | `/items/:id/updates?cursor=` | A:read | Updates feed |
| POST | `/items/:id/updates` | Owner or team | `{body, mediaIds?}` |
| GET | `/items/:id/milestones` | A:read | Milestones |
| POST | `/items/:id/milestones` | Owner of item | Add |
| PATCH | `/milestones/:id` | Owner of item | Edit or toggle done |
| DELETE | `/milestones/:id` | Owner of item | Remove |
| GET | `/items/:id/team` | A:read | Team list |
| DELETE | `/items/:id/team/:userId` | Owner of item or Self | Remove or leave |
| POST | `/items/:id/join-requests` | C:member | `{message}` ("Ask to join the team") |
| GET | `/items/:id/join-requests` | Owner of item | Pending requests |
| POST | `/items/:id/join-requests/:requestId/decision` | Owner of item | `{approve}` |
| DELETE | `/items/:id/join-requests/mine` | Self | Cancel |

### 15.13 Campaigns (`campaigns`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/assets/:id/campaigns?status=active|ended&cursor=` | A:read | Cards with progress and participants |
| POST | `/assets/:id/campaigns` | A:post (C:mod) | `{title, goal, startsAt, endsAt, tasks[]}` |
| GET | `/campaigns/:id` | A:read | Detail |
| PATCH | `/campaigns/:id` | C:mod | Edit before end |
| POST | `/campaigns/:id/end` | C:mod | Ends and finalizes results |
| POST | `/campaigns/:id/join` | C:member | Join campaign |
| GET | `/campaigns/:id/me` | C:member | My points, rank and task states |
| GET | `/campaigns/:id/tasks` | A:read | Tasks |
| POST | `/campaigns/:id/tasks` | C:mod | Add task |
| PATCH | `/tasks/:id` | C:mod | Edit task |
| DELETE | `/tasks/:id` | C:mod | Remove task |
| POST | `/tasks/:id/complete` | Participant | `{proof?}` ("Mark done") |
| GET | `/campaigns/:id/completions?status=pending` | C:mod | Review queue |
| POST | `/completions/:id/decision` | C:mod | `{approve, note?}` |
| GET | `/campaigns/:id/leaderboard?limit=` | A:read | Rank, user, points |
| GET | `/campaigns/:id/results` | A:read | Final summary after the end |

### 15.14 Discover and explore (`discover`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/discover/communities` | U | Personalized top public communities (Section 8.2) |
| GET | `/discover/people` | U | People you may know (8.3) |
| POST | `/discover/people/:userId/dismiss` | U | Hide a suggestion |
| GET | `/discover/birthdays` | U | Celebrating today (8.4) |
| GET | `/discover/events` | U | Upcoming events in my communities and public highlights |
| GET | `/discover/because` | U | "Because you like …" tiles |
| GET | `/discover/school` | U | New from your school |
| GET | `/explore/communities?category=&school=&q=&sort=&cursor=` | U | Public community directory with filters |
| GET | `/explore/categories` | U | Categories with counts |

### 15.15 Search (`search`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/search?q=&types=&communityId=&limit=` | U | Grouped results (8.6) |
| GET | `/search/suggest?q=` | U | Prefix suggestions (8 max) |

### 15.16 Notifications (`notifications`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/me/unread` | U | `{dm: {unread, mentions}, assets: [{assetId, unread, mentions}]}` (8.1); only entries with unread > 0 |
| GET | `/me/notifications?cursor=` | U | Inbox |
| POST | `/me/notifications/read` | U | `{ids[] | all:true}` |
| GET | `/me/notification-prefs` | U | Defaults and overrides |
| PUT | `/me/notification-prefs` | U | Global level |
| PUT | `/communities/:slug/notification-prefs` | C:member | `all | mentions | none`, or mute until a time |
| PUT | `/assets/:id/notification-prefs` | C:member | Mute asset |
| POST | `/me/push-subscriptions` | U | Web Push (behind `ENABLE_PUSH`) |
| DELETE | `/me/push-subscriptions/:id` | Self | Remove |

### 15.17 Realtime (`realtime`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/me/stream` | U | Server-Sent Events (Section 7) |
| PUT | `/me/stream/view` | U | `{assetId?, conversationId?}` the thing on screen, `null` to clear |
| POST | `/me/presence` | U | `{state: online|idle}` |
| GET | `/communities/:slug/presence` | C:member | `{online: n, sample: [userCards ≤ 50]}` |
| GET | `/presence?ids=` | U | Up to 100 ids; respects `appearOffline` and blocks |

### 15.18 Media (`media`)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/uploads/sign` | U | `{kind, contentType, bytes}` → signature, upload URL, preset, folder, expiry |
| POST | `/uploads/complete` | U | `{publicId, version, signature}` verified; returns `{uploadId, url}` |
| DELETE | `/uploads/:id` | Self | Remove file |

### 15.19 Moderation (`moderation`)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/reports` | U | `{targetKind: message|post|comment|user|community|entry|item, targetId, reason, details?}` |
| GET | `/communities/:slug/reports?status=&cursor=` | C:mod | Queue |
| POST | `/reports/:id/resolve` | C:mod | `{action: dismiss|delete_content|timeout|ban, note}` |
| GET | `/communities/:slug/timeouts` | C:mod | Active timeouts |
| POST | `/communities/:slug/timeouts/:userId` | C:mod | `{until, reason}` |
| DELETE | `/communities/:slug/timeouts/:userId` | C:mod | Lift |
| GET | `/communities/:slug/audit-log?cursor=` | C:mod | Append-only log |

Endpoint count: about 210. Any endpoint the frontend needs that is missing here is added to this table first (with its access rule and rate-limit family), then built.

---

## 16. Frontend integration and the mock swap

The frontend is built against a typed client and a mock layer (`NEXT_PUBLIC_USE_MOCK`). The swap plan:

1. `shared` becomes the single source of schemas and types. The frontend's typed client is regenerated from the backend's OpenAPI (generated from the same zod schemas). Endpoints previously marked `// PROPOSED: not in backend doc` are reconciled against Section 15; the markers are removed as each is implemented.
2. Turn off mocks per feature, not all at once: `USE_MOCK_AUTH`, `USE_MOCK_USERS`, `USE_MOCK_COMMUNITIES`, `USE_MOCK_ASSETS`, `USE_MOCK_CHAT` (includes reactions and mentions), `USE_MOCK_DM`, `USE_MOCK_FEEDS`, `USE_MOCK_EVENTS`, `USE_MOCK_LISTS`, `USE_MOCK_BOARDS`, `USE_MOCK_CAMPAIGNS`, `USE_MOCK_DISCOVER`, `USE_MOCK_SEARCH`, `USE_MOCK_NOTIFICATIONS`, `USE_MOCK_MEDIA`, following the backend phases in Section 17.
3. Frontend changes the backend requires: cookie auth with `X-Square-CSRF`; a refresh interceptor (on 401 call `/auth/refresh` once, then retry); cursor pagination helpers; the SSE client with `Last-Event-ID` resume and the `view` call when the user changes asset or conversation; idempotent message sending with `clientMsgId` and optimistic rows; the upload flow (`sign → direct upload → complete`); error codes mapped to field errors and toasts; `/me/bootstrap` and `/me/unread` for the strip and the asset pills; the profile and Home screens reading `/users/:username` and `/home`.
4. Keep the mock data shapes identical to the real responses (they were designed to match), so the swap is a base-URL and flag change. Contract tests fail the build if they drift.
5. After each feature swap, the Playwright suite runs against the real backend in staging.

---
## 17. Build order and milestones

Build in this order. Each phase ends with exit criteria that must pass before the next phase starts. The frontend swaps off mocks feature by feature as phases finish (Section 16).

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 Foundation** | Monorepo, `shared`, `backend/kernel` (Nest + Fastify bootstrap, config validation, auth guard, permission client, Redis, Kysely, outbox relay, event bus, rate limiter Lua, error filter, cursor helpers, health), docker compose (Postgres, Redis), migrations tooling, CI, gateway skeleton with routing, logging, request ids | `docker compose up` runs gateway plus a dummy service; `/readyz` green; a sample event travels outbox → stream → consumer; CI green; rate limiter and cursor unit tests pass |
| **1 Identity** | `auth`, `users`, `media` (sign and complete), `badges` skeleton; schools and interests seeds | Login of an existing account lands on Home with no setup page, an unknown email on the login screen offers account creation, signup of a new email goes through the setup page, signup with an existing email just signs in; full signup and login through the frontend; refresh rotation and reuse detection tested; username rules and skeleton uniqueness tested; code attempts, resend and rate limits tested; profile read and edit works; avatar upload works end to end; DOB never in any response (test greps all responses) |
| **2 Communities and assets** | `communities`, `assets`: create (four default assets in the same flow), join/leave, roles, invites, join requests, bans, strip order, catalog, add asset, assets list grouped with permissions, guidelines rules and agreements, `perm:*` and `asset:*` caches, `/me/bootstrap` | Create a community and see the four defaults; add a catalog asset as mod; member cannot add; mods-only hidden from members; public preview works for non-members; cache invalidation on role change verified |
| **3 Conversation** | `chat`, `dm`, `realtime`, `notifications` (unread, mentions, prefs, reactions, mention autocomplete) | Send and receive in two browsers under 300 ms; replies, pins, reactions (chips only after a real reaction, limits, who reacted, moderator clear), mentions (rows, `@` badges, seen on leave, autocomplete lists everyone), solved, edit, delete; DM rules (blocked, shared-community, request limit); unread counts correct with `99+`; resume after reconnect; presence; k6: 500 viewers at 5 msg/s within targets |
| **4 Content assets** | `feeds`, `events`, `lists`, `boards`, `campaigns`, `badges` engine | Each asset kind's frontend page works against the real API; `.ics` imports into a calendar; leaderboard ties and exactly-once points tested; badges awarded from events idempotently |
| **5 Discovery** | `discover` jobs and read models, `search`, explore, Home aggregate, birthdays | Home under 200 ms p95; ranking unit tests; birthdays only for opted-in users and no DOB anywhere; search never returns private or mods-only data (test); suggestions exclude blocked users |
| **6 Moderation and hardening** | `moderation`, audit log, timeouts, authorization matrix test for every endpoint, load and chaos tests, security review, runbooks, scale-profile boot test | Matrix test green for all rows of Section 15; k6 gates pass; Redis-down and service-down drills pass; pen-test fixes applied; backups restored in a drill |
| **7 Swap and pilot** | Frontend off mocks, Playwright against staging, observability dashboards, alerts, pilot launch at one campus | All frontend flows run on the real backend; SLOs visible; kill switches tested; pilot of about 100 students |

**Parity gate.** Before Phase 2 starts, after every phase, and before launch, run the parity audit (Section 18.11). A phase is not finished while Appendix E has a row for its scope that is not fully matching.

Rough effort for planning: Phase 0 about 3 to 4 days, 1 about 5, 2 about 5, 3 about 8, 4 about 8, 5 about 5, 6 about 5, 7 about 3 with a coding agent plus review. Adjust after Phase 1.

---

## 18. Kilo prompts

Paste the **Master prompt** once at the start. Then paste each **Phase prompt** when the previous phase's exit criteria pass. Do not start a phase before the previous one is verified.

### 18.1 Master prompt

```
You are building the Square backend: a set of small, fast, secure NestJS microservices. Read docs/backend-blueprint.md completely before writing any code. It is the source of truth for architecture, data model, algorithms, security, speed targets and every endpoint. Also read docs/frontend-api-needs.md, the frontend typed client in frontend (the API layer) and the mock data, to confirm request and response shapes. If the frontend and the blueprint disagree, follow the blueprint unless the frontend version is clearly better, and write every difference to docs/api-contract-diff.md.

Product in one paragraph: Square is "Discord for campus" connecting web2 and web3 students. Users JOIN communities (no follow anywhere), talk in assets inside a community (#general, #announcements, #guidelines, #events plus catalog assets), and DM each other. Projects and campaigns are optional assets. Priorities in order: security, speed, lightness.

Hard rules:
1. Stack: Node 22, TypeScript strict, NestJS 11 with the Fastify adapter, zod for validation (schemas in shared), Kysely + pg for SQL, ioredis, jose for tokens, pino, prom-client, vitest + Testcontainers. Do NOT use Prisma, TypeORM, GraphQL, class-validator, Express, axios or lodash. Every new dependency needs a one-line justification in the PR description.
2. One Postgres schema per service, one DB role per service, RLS on, no cross-schema joins or foreign keys. Services reference other services by id only.
3. No service-to-service HTTP call on any read hot path. Use the Redis caches and events defined in Sections 4.2, 6.19 and 13. Sync internal calls are rare and use the signed service tokens.
4. Every state change that others care about writes an outbox row in the same transaction; events follow Section 13; consumers are idempotent.
5. Keyset pagination only (no OFFSET), no COUNT(*) on request paths, batch hydration (no N+1), UUIDv7 ids.
6. Every handler declares its permission (Section 4.2 and the Access column of Section 15). Every query is scoped by membership or ownership in SQL. Default deny.
7. Validate every input with strict zod schemas (unknown fields rejected). One error shape (Section 4.1) with stable codes from shared/errors.ts.
8. Rate limits from Section 14 through the kernel limiter. Idempotency keys and clientMsgId where specified.
9. Never return or log: date of birth, email (log hashes), tokens, codes, cookies.
10. Reuse backend/kernel for everything shared (bootstrap, guard, permission client, redis, db, outbox, events, limiter, errors, health). Services should be mostly their own SQL and handlers.
11. Config from environment variables validated with zod at boot; the process must refuse to start on invalid config. Provide .env.example per service.
12. Each service starts in under 2 seconds, exposes /healthz, /readyz, /metrics (internal), supports graceful shutdown, and can run alone or inside a combined process through the SERVICES env profile (Section 3.3).

Quality bar for every phase: typecheck and lint clean; unit tests for algorithms; integration tests with real Postgres and Redis for each endpoint (success, validation error, unauthenticated, forbidden, not found); the authorization matrix rows for the endpoints you added; EXPLAIN checks on hot queries; a short k6 smoke for the new hot endpoints against the targets in Section 2.1.

Working style: work phase by phase in the order of Section 17. Do not start the next phase until the exit criteria pass. Commit in small steps with clear messages. Do not stop to ask for permission between steps; ask only when blocked by a missing decision that is not covered by the blueprint (check Section 19 defaults first). At the end of each phase report: what was built, endpoints implemented (by Section 15 rows), tests and their results, measured p95 for hot endpoints, deviations from the blueprint and why, and open questions. Keep the report short.

Acknowledge by listing the 19 services and the phase order in five lines, then begin Phase 0.
```

### 18.2 Phase 0: Foundation

```
PHASE 0: Foundation (Section 17, Phase 0). Build the monorepo skeleton and the kernel.

Deliver:
- pnpm workspace with frontend (existing), backend/<service> (empty Nest apps for all 19 services plus the gateway, each with only health endpoints), shared (zod schemas, constants, errors, events, username rules) and backend/kernel.
- kernel: Nest bootstrap on Fastify (compression, helmet, strict body limit 64 KB, request id, traceparent), zod-validated config loader, pino logger with redaction, error filter producing the standard error shape, auth guard (verifies EdDSA access JWT locally with jose, supports kid rotation), signed service-token issue/verify, PermissionClient (Redis perm:* and asset:* with fallback to the owner service and singleflight), Kysely factory with per-service role and pool sizing, transactional outbox writer plus relay (SKIP LOCKED polling plus LISTEN/NOTIFY) publishing to Redis Streams, event bus consumer helper (consumer groups, retries, dead-letter after 5), Redis rate limiter (Lua) with decorators, idempotency-key interceptor, cursor encode/decode helpers, health/ready/metrics module.
- Launch profile: `SERVICES_PROFILE` values `all`, `launch-api`, `launch-realtime`, `launch-worker`, `pilot`, `scale` with the in-process ServiceClient (Section 3.3) and entrypoints `start:api`, `start:realtime`, `start:worker`.
- SERVICES profile loader: one process can boot any subset of services; ServiceClient calls in-process when co-located and internal HTTP (undici, keep-alive) otherwise.
- Gateway: JWT verify, CSRF/Origin check for cookie auth, rate limit, routing by prefix to services with per-route timeouts and a circuit breaker, request id propagation, stripping/setting the signed x-user header.
- Migrations tooling per schema in backend/db/migrations/<schema>, seeds folder, docker compose with Postgres and Redis, Makefile or pnpm scripts: dev, dev:clean, test, migrate, seed, rebuild:redis (stub).
- CI workflow: lint, typecheck, unit, integration, gitleaks, audit, container build for changed services.

Exit criteria: docker compose up runs the gateway plus a dummy service; /readyz is green; a sample event travels outbox -> stream -> consumer exactly once under a forced consumer crash and retry; rate limiter and cursor helpers have unit tests; the SERVICES=all and SERVICES=core,chat profiles both boot in CI; CI is green. Report as specified in the master prompt.
```

### 18.3 Phase 1: Identity

```
PHASE 1: Identity (Section 17, Phase 1). Services: auth, users, media, badges (skeleton). Sections to follow: 5 (auth and sessions, username rules), 6.1 to 6.3 and 6.16, 8.9 (badge engine skeleton), 10 (uploads), 15.2, 15.3, 15.4, 15.18.

Deliver:
- auth: request-code, verify-code, signup with self-reported student/alumni status, refresh, logout, logout-all, sessions list/revoke. Email code state in Redis (HMAC-hashed, 10 min, 5 attempts, 60 s resend, per email and per IP caps), uniform responses and timing, email sending through a queue with the provider behind an interface (Resend adapter plus a console adapter for local), EdDSA access tokens (10 min), opaque refresh tokens with rotation and family reuse detection, __Host- cookies, CSRF double-submit, session denylist in Redis. Self-reported education status does not grant student verification.
- users: signup creation with age gate from the DOB, username validation (regex, reserved, profanity, skeleton uniqueness), availability endpoint with the Redis negative cache, schools and interests seeds, me, me/settings, profile read (public fields only, never DOB), profile edit, blocks, export and deletion request stubs, internal batch endpoint, usr:{id} cache maintenance, stats counters via events, birthday_md derivation and the opt-in flag.
- media: uploads/sign (Cloudinary signature with preset, folder, format and size limits per kind), uploads/complete (verify signature and public_id prefix), delete, cleanup job for orphans, upload.ready event consumed by users to set avatar/banner.
- badges: tables, seed definitions, consumer that awards "Verified student" and "Early member" idempotently, GET endpoints, pins.
- Gateway routes for all of the above and /config.
- Login and signup behavior exactly as Section 5.1: verify-code returns `isNewUser` only after the code is proven; an account is created only by POST /auth/signup; the frontend `/login` and `/signup` screens both work against these endpoints (existing account on login goes to Home with no setup; unknown email on login offers account creation with the verified ticket).

Tests that must exist: code attempt/expiry/resend/rate-limit behavior; reuse of a rotated refresh token revokes the family; enumeration test (known and unknown emails respond identically); username cases (digits, spaces, confusable lookalike collision, reserved words); a test that scans all user-facing responses and fails if date_of_birth or email appears for other users; upload signature tamper test; authorization matrix rows. Run a k6 smoke for login and /me.
Exit criteria as in Section 17, Phase 1. Report as specified.
```

### 18.4 Phase 2: Communities and assets

```
PHASE 2: Communities and assets (Section 17, Phase 2). Services: communities, assets. Follow Sections 1, 4.2, 6.4, 6.5, 6.19, 15.5, 15.6.

Deliver:
- communities: create (trust level >= 1, max 3 owned), get/about, edit, soft delete with email-code re-auth, join (open | request | invite-only), leave, join requests and decisions, invites (create, preview, accept, revoke), members list with search and roles, role change (owner only), kick, bans, transfer ownership, strip order, GET /me/communities. Maintain members_count transactionally. Maintain perm:{communityId}:{userId}, ucomm:{userId} and cmem:{communityId} in Redis from events; DEL on role change, kick, ban, leave.
- assets: seed asset_catalog (Section 19 appendix A), create the four defaults when community.created arrives (the community stays not-ready until they exist), list grouped by category with only readable assets, add from catalog (mod and owner), reorder, patch topic and thresholds (owner), delete non-default, resolver GET /communities/:slug/assets/:key, rules (guidelines) read and replace with version check, agreements. Maintain asset:{assetId} and assets:{communityId} caches and invalidate on events. No custom assets (constant ALLOW_CUSTOM_ASSETS=false).
- Gateway: GET /me/bootstrap (me, strip with unread placeholders until chat exists) with a 150 ms budget and partial results.

Tests: role matrix on every endpoint; mods-only never appears for members in lists, search stubs or errors that reveal its existence; public preview rules for non-members; default assets undeletable; permission cache invalidation after promote/demote/kick/ban (cache hit and miss paths); invite single-use and expiry; join request flow; concurrency test (two simultaneous joins do not double count).
Exit criteria as in Section 17, Phase 2. Report as specified.
```

### 18.5 Phase 3: Conversation

```
PHASE 3: Conversation (Section 17, Phase 3). Services: chat, dm, realtime, notifications. Follow Sections 7, 8.1, 8.12, 8.13, 6.6, 6.7, 6.15, 15.7, 15.8, 15.16, 15.17.

Deliver:
- chat: messages with replies, clientMsgId idempotency, seq via HINCRBY seq:{communityId}, tombstone delete, edit, reactions, pins, solved (support asset), read cursors with write-behind persistence, in-asset search, reactions (tables, counts, limits, who reacted, moderator clear, `reaction.updated`), mentions (parsing max 5, mention rows, `{unread, mentions}` summaries, seen endpoints, mentionable autocomplete), trust-level and duplicate-flood checks, monthly partitions with pg_partman, indexes including (asset_id, seq).
- dm: conversations (pair_key unique, find-or-create with ON CONFLICT), messages, reactions and mentions as in chat, read state, canDM rules (blocked, dm_privacy, shared community through SINTERCARD, message-request limit of 3, new conversation limits), tombstones, partitions.
- realtime: GET /me/stream SSE with heartbeat, Last-Event-ID resume from stream:{userId}, resync fallback, backpressure, per-user and per-IP connection caps, PUT /me/stream/view hot-room model, presence with TTL and online:{communityId} zsets honoring appear_offline and blocks, typing behind ENABLE_TYPING, permission re-check before delivering room events, graceful draining on deploy.
- notifications: GET /me/unread (single Redis pipeline), mentions and reply notifications, inbox, prefs and mutes (community and asset level), notification events to realtime.
- Update GET /me/bootstrap and GET /communities/:slug/assets to include real unread counts.

Tests: two-client integration test (send in A, receive in B under 300 ms) for chat and DM; duplicate send with the same clientMsgId returns the same message; unread math, join baseline and 99+ cap; resume after disconnect with and without backlog; user in asset A never receives full message payloads of asset B; blocked users cannot DM and get dm_blocked; the 4th unanswered DM request message returns dm_request_limit; mods-only messages never reach members through SSE; k6: 500 viewers at 5 msg/s and 5 000 SSE connections meeting Section 2.1.
Exit criteria as in Section 17, Phase 3. Report as specified.
```

### 18.6 Phase 4: Content assets

```
PHASE 4: Content assets (Section 17, Phase 4). Services: feeds, events, lists, boards, campaigns, plus the badges engine. Follow Sections 6.8 to 6.12, 8.5, 8.8, 8.9, 8.10, 8.11, 15.9 to 15.13.

Deliver (one service at a time, each with tests before moving on):
- feeds: posts for announcements, showcase and feedback; comments (one reply level); reactions with transactional counters; feedback Top score formula and the 10-minute decay job; pin; feedback status chips; comments toggle; If-Match versioning; link preview with the full SSRF guard from Section 8.11 and worker pool.
- events: CRUD, cancel, RSVP states with counters, attendees, upcoming/past scopes, RFC 5545 .ics (line folding, escaping, SEQUENCE, STATUS:CANCELLED), reminder zset and worker, GET /me/events.
- lists: entries with tags, deadlines, saves with counters, search/filter/sort, pin, savers, GET /me/saved, closed status when the deadline passes (job).
- boards: items with stage validation per asset type, updates, milestones, team, join requests and decisions, stage-change event.
- campaigns: campaigns, tasks, participants, completions (UNIQUE task_id,user_id), proof review, auto-verified tasks from events, Redis leaderboard with the composite tie-break score, my progress, end flow with results snapshot and badge awards.
- badges: criteria-driven engine consuming events (Shipped, Helper, Campaign finisher, Event regular, Community builder).
Gateway routes and the authorization matrix rows for every endpoint added.

Tests: ICS output parsed by an ICS parser and a golden file; leaderboard tie and exactly-once points under concurrent approvals and retries; SSRF guard against private ranges, redirects to private IPs, DNS rebinding simulation, oversize and wrong content types; feedback score ordering; permission matrix for each asset kind; stage transitions validity; join request flows.
Exit criteria as in Section 17, Phase 4. Report as specified.
```

### 18.7 Phase 5: Discovery and search

```
PHASE 5: Discovery and search (Section 17, Phase 5). Services: discover, search. Follow Sections 8.2 to 8.4, 8.6, 6.13, 6.14, 6.19, 15.14, 15.15.

Deliver:
- discover jobs: community scores every 5 minutes into disc:top using the formula in 8.2 (distinct authors, growth, freshness), activity counters from message.created, personal re-rank with diversity, explore directory with filters and cursor {score,id}, because-you-like and new-from-your-school tiles.
- people you may know (Section 8.3) with SINTERCARD scoring, cold-start fallbacks, dismissals, caching and invalidation on join/leave, reason chips, privacy of show_communities.
- birthdays (Section 8.4): nightly set builders per timezone, request-time filtering by shared community and blocks, wish endpoint with per-pair daily limit and notification, own-birthday flag. DOB and age never in responses.
- GET /home aggregate in the gateway composing the tiles in parallel with per-tile timeouts and partial results; GET /discover/events.
- search: event-fed search.docs upserts and deletes, per-kind queries with prefix, trigram and tsvector ranking, visibility filter at index and query time, community-scoped search, suggest endpoint, 150 ms budget with partial results.

Tests: ranking unit tests with fixed fixtures (new community surfaces, spammer cannot inflate, joined communities excluded); people suggestions never include blocked, dismissed or self; birthday tests for leap day, timezone boundary, opt-out immediacy, and a test that fails if any response field could expose DOB; search never returns private-community or mods-only content to non-members (explicit tests); Home p95 under 200 ms in k6 with 200 rps.
Exit criteria as in Section 17, Phase 5. Report as specified.
```

### 18.8 Phase 6: Moderation and hardening

```
PHASE 6: Moderation and hardening (Section 17, Phase 6). Service: moderation. Follow Sections 8.15, 10, 12, 14, 15.19.

Deliver:
- moderation: reports (all target kinds), review queue, resolve actions (dismiss, delete content, timeout, ban), timeouts, append-only audit log (no UPDATE/DELETE grants), events that invalidate perm caches immediately, owner alerts on bulk mod actions, trust-level recalculation job.
- Authorization matrix generator: parse the endpoint table in docs/backend-blueprint.md (or a machine-readable endpoints.json that you generate and keep in sync) and run, for every endpoint, anonymous, non-member, member, moderator, owner and blocked-user calls asserting the expected status. CI fails when an endpoint has no row.
- Security work: CORS allowlist, header review, request timeouts, DB role grants audit (DOB column), Redis ACLs per service, gitleaks, dependency audit, container hardening (distroless, non-root), threat table (Section 10) turned into automated tests where possible, kill switches (SIGNUP_ENABLED, DM_ENABLED, UPLOADS_ENABLED) with tests.
- Reliability: Redis-down degraded mode (permission fallback to Postgres, readyz degraded=true), service-down circuit breaking at the gateway, rebuild:redis implemented for perm, asset, ucomm, cmem, seq, reads, disc and bday, graceful shutdown tests, scale profile (19 processes) boot test.
- Observability: dashboards and alerts defined as code, runbooks in docs/runbooks (db-connections, redis-down, stream-lag, outbox-backlog, token-leak, mass-spam).
- Load and chaos: k6 scenarios from Section 9 as nightly gates; chaos jobs from Section 12.6.

Exit criteria as in Section 17, Phase 6. Report as specified, including a list of any endpoint whose matrix test you could not automate and why.
```

### 18.9 Phase 7: Frontend swap and pilot

```
PHASE 7: Swap and pilot (Section 17, Phase 7; Section 16). Work in frontend.

Deliver: regenerate the typed client from the backend OpenAPI; per-feature mock flags and the swap in the order auth, users, communities, assets, chat, DM, feeds, events, lists, boards, campaigns, discover, search, notifications; cookie auth with X-Square-CSRF and the 401 refresh interceptor; SSE client with resume and the view call; clientMsgId optimistic sending; upload flow (sign, direct upload, complete); cursor pagination helpers; error code mapping to field errors and toasts; use /me/bootstrap, /me/unread and /home; remove every "PROPOSED" marker as its endpoint is implemented; update docs/frontend-api-needs.md to "done"; run the Playwright suite against staging for every flow and fix mismatches on whichever side is wrong (log in docs/api-contract-diff.md).

Also set up staging and production deployments of the pilot profile (6 processes), Cloudflare, secrets, backups, the dashboards and alerts, and rehearse the kill switches.
Exit criteria as in Section 17, Phase 7. Report as specified.
```

### 18.10 Reusable prompts

**Add a new endpoint**
```
Add endpoint <METHOD /path> to <service>. First add its row (access rule, notes) to Section 15 of docs/backend-blueprint.md and its rate-limit family. Then implement: zod schema in shared, handler with the declared permission, Kysely query scoped by membership, indexes if needed (show EXPLAIN), outbox event if others care, integration tests (success, validation, unauthenticated, forbidden, not found), authorization matrix row, and the typed-client function in frontend. Report briefly.
```

**Fix a slow endpoint**
```
Endpoint <path> is slower than its Section 2.1 target. Measure with k6 (record p50/p95), capture EXPLAIN (ANALYZE, BUFFERS) for each query, check for N+1, missing indexes, large payloads, cache misses and event-loop lag. Fix the root cause (index, query shape, batch hydration, cache key, payload trim), re-measure, and add a regression threshold to the nightly k6 gate. Report before and after numbers.
```

**Security review of a service**
```
Review <service> against Section 10 and the threat table. Check: every handler's permission and SQL scoping, input schemas (unknown fields rejected), IDOR attempts with another user's ids, mass assignment, rate-limit coverage, logging of secrets or PII, error leakage, DB grants, Redis ACL, SSRF or injection surfaces. Write a failing test for every finding first, then fix it. Report findings by severity.
```

### 18.11 Parity audit and completion (frontend and backend)

Run this before Phase 2, after every phase and before launch. Goal: the frontend and the backend are the same product. Every screen and feature in the frontend has a working backend behind it, every backend feature has a screen or a documented reason, and both sides use the same contract.

```
PARITY AUDIT AND COMPLETION. Sources of truth: docs/backend-blueprint.md (v1.1, especially Appendix E and Sections 5, 8, 15), the frontend in frontend/ (routes, components, hooks, typed client, mock handlers and mock data) and shared/ (zod schemas). Priorities: security, speed, lightness. Do not change the product design or behavior of the frontend except to match the contract or to switch a feature from mock to real.

1. INVENTORY (write docs/parity-matrix.md, one row per feature, same rows as Appendix E plus anything you find that is missing there):
   - Frontend: every route and screen, every API call in the typed client (method, path, request, response), every mock handler, every feature flag and constant (USE_MOCK_*, ALLOW_CUSTOM_ASSETS, ADD_ASSET_ROLES, MAX_MENTIONS, QUICK_REACTIONS, PROFILE_TABS, ENABLE_TYPING and similar).
   - Backend: every implemented endpoint (from the controllers and the generated OpenAPI), its zod schemas, permission, rate-limit family and tests.
   - Columns: feature, frontend screen/route, frontend calls, backend endpoint(s), backend status (done / partial / missing), contract match (yes / shape differs / path differs / missing), mock flag status, parity test (Playwright spec), phase.
2. DIFF AND DECIDE for every row that is not "done and matching":
   - frontend calls something the backend lacks -> implement it in the right service (add the row to Section 15 first, with its access rule and rate-limit family);
   - backend has something the frontend lacks -> add the screen or mark it "backend only" with a reason;
   - shape or path differs -> follow the blueprint unless the frontend version is clearly better; change the loser, update shared/ schemas, the blueprint and docs/api-contract-diff.md;
   - behavior differs (for example the setup page shown to existing users, reactions auto-appearing, mention highlight, unread badge states, default assets missing, blue label styling data) -> fix the side that is wrong and add a test.
3. ONE CONTRACT: shared/ zod schemas are the only definition of request and response shapes. The mock handlers and the real controllers must both validate against the same schemas. Add a contract test that runs the same fixtures through (a) each mock handler and (b) the real endpoint and asserts identical shapes (field names, types, nullability, ordering rules like reactions ordered by first reaction time, cursor format, error codes).
4. FEATURE CHECKLIST: for each of these, write or update ONE end-to-end Playwright spec under frontend/e2e/parity/ and run it twice, once with every USE_MOCK_* flag true and once against the real backend (flags false, local docker stack), and require identical results:
   login of an existing account (no setup page); login with unknown email (offers create account); signup new email (setup page); signup with existing email (signed in); logout and session refresh; profile view, popover and edit with avatar/banner upload; privacy settings; communities (create, join, leave, roles, invites, join requests); assets (four defaults present, categories and order, add from catalog by owner/mod, no add for members, mods-only hidden, remove non-default, rules and agreement); chat (send, reply line, edit, delete, pins, solved in support, in-asset search, unread banner, mark read, jump to latest); reactions (button under every message and reply, no chips until someone reacts, picker, toggle, limits, who reacted, moderator clear, realtime update); mentions (autocomplete lists all members on @, max 5, @ badges in the three states, jump-to-mention button above send, seen on scroll and on leave, no row highlight); DMs (start, rules and blocked state, reactions, mentions, mute/archive/hide, unread); announcements, showcase, feedback; events (RSVP, cancel, .ics); resources and opportunities (save, deadline); projects and hackathons boards (stage move, join request); campaigns (task, approval, leaderboard); badges; Home discovery (top communities, people, birthdays only for opted-in with no DOB in any response, events, because-you-like, school); explore; global search (scoped and global, no private or mods-only leaks); notifications and unread summaries; presence and SSE resume.
5. FLAGS: when a backend feature passes its parity spec, set its USE_MOCK_* flag to false by default and keep the mock available only behind NEXT_PUBLIC_USE_MOCK=true. No feature may stay mocked once its backend exists.
6. REPORT (short): parity percentage by area (done and matching / total rows), the list of gaps fixed, gaps remaining with owner phase, contract differences resolved, tests added, and any blueprint change. If any row is still not matching, say so plainly; do not mark a row done without its passing parity spec.
Commit in small steps (feat, fix, test, docs). Do not start the next phase.
```

### 18.12 Deployment prep (launch profile, Pxxl)

```
PREPARE DEPLOYMENT. Add the `launch` profile and the files to deploy the backend as three processes, without changing service behavior. Follow Sections 3.3, 5.3 and 12.3.
1. Profiles: SERVICES_PROFILE = all | launch-api | launch-realtime | launch-worker with in-process ServiceClient; entrypoints start:api, start:realtime, start:worker, build:backend; each reads PORT, binds 0.0.0.0 and exposes /healthz and /readyz.
2. infra/docker: one multi-stage Dockerfile with build arg TARGET (api | realtime | worker | frontend), Node 22 alpine, non-root; docker-compose.launch.yml running the three backend targets plus Postgres and Redis.
3. Cookies and CORS: COOKIE_DOMAIN, WEB_ORIGINS, API_PUBLIC_URL, STREAM_PUBLIC_URL, trust proxy; the frontend reads NEXT_PUBLIC_API_URL and NEXT_PUBLIC_STREAM_URL.
4. Diagnostics (off in production unless DIAG_ENABLED=true plus a secret header): GET /_diag/sse (heartbeat every 25 s for 10 minutes), GET /_diag/env-check (presence of variables, never values), GET /_diag/deps (Postgres, Redis and Cloudinary reachability with timings).
5. docs/DEPLOY.md: topology, exact settings per app (root directory, install, build and start commands, port, Node 22, env variables and which are secrets), the 7-point capability test with a results table, fallback host plan, rollback, deploy order (migrations, Redis, api, worker, realtime, web).
6. Verify with docker compose locally: the three processes run, a request reaches users, communities and chat in-process, the SSE diagnostic stays open for 10 minutes, the worker consumes an outbox event. Paste outputs and list the files changed.
```

---

## 19. Open decisions and defaults

Kilo uses the default unless Vic changes it. Defaults are chosen to be safe and reversible.

| # | Decision | Default |
|---|---|---|
| O1 | Minimum age to join | 16 (checked on the backend from DOB; message stays generic) |
| O2 | Who can create communities | Verified students (trust level ≥ 1), max 3 owned, 2 per day |
| O3 | Username change | Once per 30 days; old name reserved 90 days |
| O4 | School email required to sign up | No; anyone can sign up, verification is a badge and trust level |
| O5 | Hosting region | Measure latency from Lagos to a European region and to Cape Town before choosing; compute, Postgres and Redis in the same region |
| O6 | Email provider | Resend (adapter interface so it can change) |
| O7 | Redis provider | Managed Redis with Streams support (Redis Cloud) or self-hosted on the app platform |
| O8 | Event transport | Redis Streams (`TRANSPORT=redis`), NATS kept as a flag |
| O9 | Realtime transport | SSE; WebSocket only if a feature needs client-to-server streaming |
| O10 | DM privacy default | `shared` (only people who share a community with you, or existing conversations) |
| O11 | Message edit window | No limit; edited flag shown; moderators can delete anything |
| O12 | Account deletion grace | 7 days |
| O13 | Search engine | Postgres trigram plus tsvector; Typesense or Meilisearch only past 100k docs |
| O14 | Pilot campus | To be chosen by Vic (the mock data uses "FUT Minna") |
| O15 | Wallets, tokens, funding, voting | Out of v1; the user model reserves `wallet_address` as a nullable column in a later migration |
| O16 | Custom domain | Buy a short domain and use `app.`, `api.` and `stream.` subdomains with `COOKIE_DOMAIN` (needed for cookies across hosts) |
| O17 | Reaction notifications | Off (`ENABLE_REACTION_NOTIFICATIONS=false`); when on, aggregated once per message per 10 minutes |
| O18 | Backend host | Pxxl if the capability test passes (SSE 5 minutes, worker or second app, outbound to Postgres and Redis); otherwise a host with always-on processes for the backend and Pxxl for the frontend |

---

## Appendix A. Asset catalog seed

| Key | Label | Kind | Category | Default | Add by |
|---|---|---|---|---|---|
| general | #general | chat | Community | yes | auto |
| announcements | #announcements | feed | Information | yes | auto |
| guidelines | #guidelines | rules | Information | yes | auto |
| events | #events | events | Information | yes | auto |
| support | #support | chat | Community | no | mod |
| introductions | #introductions | chat | Community | no | mod |
| off-topic | #off-topic | chat | Community | no | mod |
| showcase | #showcase | feed | Community | no | mod |
| feedback | #feedback | feed | Community | no | mod |
| resources | #resources | list | Resources | no | mod |
| opportunities | #opportunities | list | Resources | no | mod |
| projects | #projects | board (Idea, Building, Launched) | Build | no | mod |
| hackathons | #hackathons | board (Looking for team, Team formed, Submitted) | Build | no | mod |
| campaigns | #campaigns | campaigns | Build | no | mod |
| mods-only | #mods-only | chat (restricted) | Community | no | mod, hidden from members |

Category order in the UI: Information, Community, Resources, Build (only categories that contain assets).

## Appendix B. Error codes (starter set)

`unauthenticated`, `forbidden`, `not_found`, `validation_failed`, `rate_limited`, `conflict`, `idempotency_replay`, `code_invalid`, `code_expired`, `code_attempts_exceeded`, `resend_too_soon`, `signup_ticket_invalid`, `username_taken`, `username_invalid`, `username_reserved`, `age_not_allowed`, `session_revoked`, `csrf_failed`, `asset_forbidden`, `asset_protected`, `asset_not_in_catalog`, `community_forbidden`, `invite_required`, `invite_expired`, `banned`, `timed_out`, `dm_blocked`, `dm_closed`, `dm_request_limit`, `message_too_long`, `emoji_not_allowed`, `reaction_limit_reached`, `link_not_allowed`, `duplicate_message`, `comments_disabled`, `upload_too_large`, `upload_type_not_allowed`, `upload_signature_invalid`, `link_preview_blocked`, `already_exists`, `version_mismatch`, `service_unavailable`.

## Appendix C. Reference query shapes

Messages page (newest first, keyset):
```sql
SELECT m.id, m.author_id, m.body, m.reply_to_id, m.seq, m.created_at, m.edited_at, m.deleted_at,
       r.id AS r_id, r.author_id AS r_author, left(r.body, 120) AS r_snippet, r.deleted_at AS r_deleted
FROM chat.messages m
LEFT JOIN chat.messages r ON r.id = m.reply_to_id
WHERE m.asset_id = $1 AND ($2::uuid IS NULL OR m.id < $2)
ORDER BY m.id DESC
LIMIT $3 + 1;          -- uses index (asset_id, id desc); partitions pruned by id time range
```

Join community (one transaction, no double counting):
```sql
INSERT INTO communities.members (community_id, user_id, role) VALUES ($1, $2, 1)
ON CONFLICT DO NOTHING RETURNING 1;
-- only if a row was inserted:
UPDATE communities.communities SET members_count = members_count + 1 WHERE id = $1;
INSERT INTO communities.outbox (type, payload) VALUES ('member.joined', $3);
```

People/DM pair key (race-free find-or-create):
```sql
INSERT INTO dm.conversations (pair_key, user_a, user_b)
VALUES ($1, $2, $3) ON CONFLICT (pair_key) DO UPDATE SET pair_key = EXCLUDED.pair_key
RETURNING id;
```

Leaderboard score (Redis): `ZADD lb:{id} {points * 1e9 + (1e9 - secondsSinceStart)} {userId}`.

## Appendix D. Definition of done for Backend v1

- All endpoints in Section 15 implemented, in the authorization matrix, with tests.
- Every hot endpoint meets Section 2.1 p95 targets in the k6 nightly gate.
- No response anywhere exposes DOB or email of another user (automated scan).
- Private and mods-only data never leaks through search, discover, notifications or SSE (automated tests).
- Redis-down and one-service-down drills pass; backups restored in a drill.
- The frontend runs entirely on the real backend with no mock flags and the Playwright suite green on staging.
- Appendix E has no row that is not "done and matching", and every row has a passing parity spec in both mock and real mode.
- Login of an existing account never shows the setup page; reactions appear only after a real reaction; mentions never highlight the row on open.
- Runbooks, dashboards, alerts and kill switches exist and have been rehearsed.
- Pen-test findings of high severity fixed.

## Appendix E. Feature parity matrix

One row per frontend feature. "Phase" is the phase that delivers the backend. Every row needs a parity spec at `frontend/e2e/parity/<name>.spec.ts` that passes with mocks and with the real backend.

| # | Frontend feature (route or component) | Backend endpoints (Section 15) | Service | Phase |
|---|---|---|---|---|
| 1 | Login (`/login`): email, code, Home for existing accounts, "No account yet" screen, remembered email | request-code, verify-code, refresh, logout | auth | 1 |
| 2 | Signup (`/signup`) and setup page (`/signup/setup`): username live check, school search, date of birth with age gate | request-code, verify-code, signup, username-available, schools | auth, users | 1 |
| 3 | Education status, sessions and devices (settings) | signup education status, sessions | auth | 1 |
| 4 | App bootstrap: community strip, unread, DM badge, config | `/me/bootstrap`, `/me/communities`, `/me/unread`, `/config` | gateway | 2, 3 |
| 5 | Home / Discover dashboard: greeting hero, top communities, people you may know (dismiss), celebrating today (wish), events, because you like, new from your school | `/home`, `/discover/*`, `/users/:username/wish` | discover | 5 |
| 6 | Explore (`/explore`): directory, filters, search | `/explore/communities`, `/explore/categories` | discover | 5 |
| 7 | Global search (Ctrl/Cmd+K, mobile sheet, community scoped) | `/search`, `/search/suggest` | search | 5 |
| 8 | Notifications inbox and bell | `/me/notifications`, read, prefs, push | notifications | 3 |
| 9 | Create community; community page; About page; join, leave, invite links | communities endpoints (15.5) | communities | 2 |
| 10 | Members list, roles, kick, ban, join requests, community settings, transfer ownership | communities endpoints (15.5) | communities | 2 |
| 11 | Strip order, unread dots, community mute | `/me/communities/order`, notification prefs | communities, notifications | 2, 3 |
| 12 | Assets list (desktop panel and mobile assets page): four undeletable defaults, categories, flat blue "# name" rows, unread badges (number, `@`, `@` plus number) | `/communities/:slug/assets`, `/me/unread` | assets | 2, 3 |
| 13 | Add asset "+" dialog from the catalog (owner and moderator only), remove, reorder, permissions, mods-only hidden | `/asset-catalog`, POST, DELETE, order, PATCH | assets | 2 |
| 14 | Guidelines page: numbered rules, edit, reorder, "I have read and agree" | rules, agreement | assets | 2 |
| 15 | Chat: rows, grouping, day separators, reply lines, edit, delete, pins, solved (support), in-asset search, unread banner, mark read, jump to latest | chat endpoints (15.7) | chat | 3 |
| 16 | Reactions: add button under every message and reply, picker, chips only after real reactions, toggle, limits, who reacted, moderator clear, live updates | reaction endpoints (15.7, 15.8) | chat, dm, realtime | 3 |
| 17 | Mentions: autocomplete of everyone on `@`, max 5, blue pills, jump-to-mention button above send, seen on scroll and on leave, no row highlight | mentions, mentionable, `/me/unread` (15.7, 15.8, 15.16) | chat, dm, notifications | 3 |
| 18 | Typing indicator, presence dots, online counts, SSE resume | `/me/stream`, view, presence | realtime | 3 |
| 19 | DMs: list on Home, start chat, thread, rules ("You can't message this user"), mute, archive, hide, unread | dm endpoints (15.8) | dm | 3 |
| 20 | Block, unblock, report | blocks, reports | users, moderation | 3, 6 |
| 21 | Announcements feed and composer, pin, comments, like | feeds endpoints (15.9) | feeds | 4 |
| 22 | Showcase and Feedback: media posts, link preview, Top and New, status chips, upvotes | feeds endpoints (15.9) | feeds | 4 |
| 23 | Events: list, event page, RSVP, add to calendar (.ics), add, edit, cancel | events endpoints (15.10) | events | 4 |
| 24 | Resources and Opportunities: search, tags, sort, save, deadline countdown, add entry | lists endpoints (15.11) | lists | 4 |
| 25 | Projects and Hackathons boards: columns, item page, updates, milestones, join requests | boards endpoints (15.12) | boards | 4 |
| 26 | Campaigns: cards, tasks, mark done, review, leaderboard, results | campaigns endpoints (15.13) | campaigns | 4 |
| 27 | Badges: earned and locked, pins, header badges | badges endpoints (15.4) | badges | 1, 4 |
| 28 | Profile page (`/u/[username]`): header, tabs About, Communities, Badges, Projects, Activity, in common | users endpoints (15.3) | users | 1, 2, 4 |
| 29 | Profile popover from avatars and usernames | `/users/:username/card` | users | 1 |
| 30 | Edit profile and privacy (birthday opt-in, appear offline, show communities, DM privacy), avatar and banner upload | PATCH `/me`, settings, uploads | users, media | 1 |
| 31 | Uploads: avatar, banner, post media, event cover, progress and retry | `/uploads/sign`, `/uploads/complete` | media | 1 |
| 32 | Account export and deletion | `/me/export`, DELETE `/me` | users | 6 |
| 33 | Moderation: report content, queue, timeouts, audit log | moderation endpoints (15.19) | moderation | 6 |
| 34 | Deployment: launch profile, cookie domain, health checks | none | all | 7 |

End of blueprint.