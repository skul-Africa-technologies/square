# Rank & Reputation Progression System — Plan & Inspection Report

Status: inspection complete. No feature code written yet (this document is step 1 of the
implementation sequence). It records what actually exists, the deviations from the brief that
the real architecture forces, the assumptions, the open decisions with the default applied, and
the file-level implementation plan.

---

## 1. Inspection findings

### 1.1 Backend is a modular monolith, not microservices
- The runtime is a single **NestJS + Fastify** app: `backend/gateway` (`backend/README.md:3-13`).
  Global route prefix `v1` (`backend/gateway/src/main.ts:93-99`).
- Every `backend/<domain>/` folder (`badges`, `users`, `moderation`, `realtime`, …) is a
  **1-line placeholder package** (`backend/badges/src/index.ts` = `// badges - placeholder service`).
- All real domain logic is in `backend/gateway/src/<domain>.controller.ts`, registered in
  `app.module.ts:28`. Data access is **raw parameterized `pg` SQL** via `DatabaseService.pool`
  (`backend/kernel/src/database.ts`). Kysely is instantiated but typed as `Record<string, never>`
  (unused for queries). There is **no repository layer**.
- The only real service class is `ReactionsService` (`reactions.service.ts`), which is the
  reference for transactions + outbox + rate-limit + cursor.

### 1.2 Kernel primitives to reuse
- **Auth**: `JwtAuthGuard` (`backend/kernel/src/auth.ts:68-125`) verifies an EdDSA JWT from the
  `__Host-sq_access` cookie; **user id = `claims.sub` → `request.user.id`** (`auth.ts:118-123`).
  `@Public()` decorator marks public routes. `AuthenticatedUser = { id, sessionId, trustLevel, sessionVersion }`.
- **Outbox / event bus**: `insertOutboxEvent(client, event)` writes `kernel.outbox` + `pg_notify`
  in the same tx (`outbox.ts:17-27`); `OutboxRelay.publishBatch` (worker, 1s poll) `XADD`s to
  Redis stream **`evt:<type>`** (`outbox.ts:36-61`). `EventConsumer` (consumer group + `XACK` +
  `consumer_receipts` idempotency) exists (`outbox.ts:64-100`) but is **never instantiated at
  runtime** — there is **no live consumer and no dead-letter queue today**.
- **Rate limit**: `RedisRateLimiter.consume(family, key, {limit, windowMs})` (`rate-limiter.ts`).
- **Realtime**: only a **room-addressed** SSE endpoint exists
  (`reactions.controller.ts:156-243`) using Postgres `LISTEN kernel_reaction_outbox` + `pg_notify`,
  addressed by `(scope, roomId)` — **no per-user channel exists**.
- **Cursor**: `encodeCursor/decodeCursor` keyset helper (`backend/kernel/src/cursor.ts`).
- **Errors**: `ApiException` + global filter → `{ error: { code, message, field, requestId } }`
  (`backend/kernel/src/errors.ts`).
- **Config**: zod, fail-fast (`backend/kernel/src/config.ts`), template `.env.example`.

### 1.3 Database conventions
- Migrations: `backend/db/migrations/NNNN_*.sql`, **forward-only, idempotent, no up/down pairs**
  (`backend/gateway/src/migrate.ts`). Schemas per domain (`CREATE SCHEMA IF NOT EXISTS …`).
- **No DB roles, no RLS** (RLS was explicitly disabled in `0012_production_hardening.sql:12-14`,
  "single owner role"). Authorization is 100% application-side.
- **No UUIDv7 / no `uuid` columns / no `gen_random_uuid()`**: ids are `text` PKs generated in app
  code with `randomUUID()` (`content.controller.ts:168`, `reactions.service.ts:449`).
- `timestamptz NOT NULL DEFAULT now()` everywhere; soft deletes via nullable `deleted_at`.

### 1.4 Existing progression/reward mechanism: NONE
- No `xp|reputation|level(computed)|progress|streak` anywhere. Campaign `points` columns exist
  (`0005_content_assets.sql:140,148,159`) but are **never aggregated/awarded/read**. `profiles.level`
  is free text. `badges` schema exists with **zero tables** and no award code. → Build from scratch;
  reuse only outbox/cursor/rate-limit/SSE primitives.

### 1.5 Activity sources that exist today (emission audit)
| Source | Exists | Emit site | Outbox? | Missing |
|---|---|---|---|---|
| Reaction (asset) | yes | `reactions.service.ts:448,470` (`reaction.toggled`/`reaction.updated`) | **Yes** | filter `scope="asset"` for XP |
| Message in public asset | yes | `conversation.controller.ts` `sendChat` | No | add `message.created` emit |
| Reply | yes (`reply_to_id`) | same | No | derive from `reply_to_id` in `message.created` |
| DM message | yes | `conversation.controller.ts` `sendDm` | No | **must never count** |
| Event RSVP | yes | `content.controller.ts` `rsvp` | No | check-in **not found** → future |
| Community joined | yes | `platform.controller.ts` `join`/`acceptInvite` | No | add `community.joined` |
| Profile completed | derived | `identity.controller.ts` (`profileComplete`) | No | add `profile.completed` on setup |
| Badge awarded | no tables | — | No | future integration point |
| Project/campaign complete | partial (`points`) | `content.controller.ts` | No | future integration point |
| Streak / last-active | **none** | — | — | compute from `xp_daily` |
| Moderation sanction/ban | yes | `moderation.controller.ts` | No | add `moderation.sanction` (freeze) |
| Account created | yes | `identity.controller.ts` | No | account age from `users.created_at` |

### 1.6 Frontend
- Profiles: `features/profile/ProfileView.tsx`; own vs other via `isOwn` (~line 142), username colour
  `text-name-self` (own) / `text-name-other` (others). Rank slot: beside `<h1>` (~line 320) or badge row.
- Compact identity surfaces: `features/assets/MemberList.tsx` `Row`, `components/messages/MessageRow.tsx`
  author line. No hover-card component exists.
- Nav/shell: `components/shell/MobileShell.tsx`, `components/ui/back-button.tsx`, `lib/navigation.ts`
  (`getParentPath`, `useBack`, `markNavigation`, `activeTopLevelTab`), `AppShell.tsx`
  (`isProfileView = /^\/u\/[^/]+$/`). `isRoomRoute` in `mobileShell.ts` (profile is hub-style).
- Tokens: `app/globals.css` `:root` — **dark theme only** (`html.dark`, no light theme). lime primary,
  blue accent, `--name-self`/`--name-other`.
- Fonts: **no `next/font` at all**; `--font-inter`/`--font-space-grotesk` are system stacks.
- Icons: **lucide-react 1.77.0**; all required icons exist (PascalCase): `CircleDot`, `Network`,
  `Binary`, `Grid3x3`, `Compass`, `ShieldCheck`, `BadgeCheck`, `Workflow`, `Orbit`, `Zap`, `Atom`,
  `Crown`, `Infinity`. Adapter must map `grid-3x3 → Grid3x3`, `circle-dot → CircleDot`, etc.
- API client: `lib/api/{index,real,mock,types}.ts`, `lib/config.ts` (`NEXT_PUBLIC_USE_MOCK` only;
  no `USE_MOCK_*` flags). `docs/frontend-api-needs.md` documents endpoints.

---

## 2. Deviations from the brief forced by the real architecture
1. **Not microservices**: implement as a new `reputation.controller.ts` in the gateway + a
   `backend/reputation/` placeholder package (logical boundary), **not** a standalone service with
   its own DB role/RLS.
2. **No RLS / DB roles**: private progression is protected in app code — owner-only routes take
   **no id/username param** (identity from `request.user.id`); public routes are allowlisted.
3. **Migrations are forward-only** (no `down`): the brief's "reversible" is met by writing an
   idempotent forward migration plus a separate documented `down` note; the runner has no down step.
4. **Ids are `text` + `randomUUID()`**, not UUIDv7 (no extension available). Follow convention.
5. **No user-addressed realtime**: add a new owner-only SSE (new `pg_notify` channel
   `kernel_rank_outbox`) modeled on the reaction room stream.
6. **No live consumer / no DLQ**: wire the existing `EventConsumer` for the first time and add a
   dead-letter stream `evt:<type>:dlq`.
7. **No `next/font` today**: add `Kaushan_Script` via `next/font/google` (display swap, latin, one
   weight) → `--font-rank` + `.font-rank`. (Build-time fetch; acceptable per brief.)
8. **Dark theme only**: no light-theme colour variants (noted, not invented).

---

## 3. Open decisions (section 13) — default applied, flagged
- **Scoring weights/caps**: PLACEHOLDERS (tunable via config table). Applied as written in §3.3.
- **Thresholds (min_xp)**: Nobis 0, Node 100, Byte 300, Pixel 700, Pioneer 1400, Sentinel 2500,
  Validator 4200, Protocol 6500, Nexus 10000, Overclock 15000, Quantum 22000, Sovereign 32000,
  Infinity 50000. Stored in `rank_definitions`, env-overridable.
- **"Newly qualified member"** = completed `/signup/setup` (Nobis, 0 XP row created lazily).
- **Backfill ceiling** = Pioneer; run **dry-run first**, apply after review.
- **Moderation** = freeze (`xp_frozen_until`) + audited compensating "revoked" ledger rows; **never demote**.
- **DMs never count** (privacy/collusion).
- **Event check-in / project / campaign completion** = **future integration points** (no fabricating).
- **Rank-up** = in-app celebration only (no push).
- **Light theme** = none (dark only).

## 4. Assumptions
- Single owner DB role; app enforces all authz.
- Reaction XP only for `scope="asset"` (public/community), never DM.
- Message quality: ≥3 words and ≥15 chars, not a near-duplicate of the user's last 10 (normalized
  hash), not bot/system, not DM.
- Reaction/reply XP only from accounts >24h old that completed setup; ignore muted/blocked.
- Community-join XP after 24h continued membership, first 5 communities.
- `xp_total` non-decreasing except audited revocation; rank never drops.

---

## 5. Implementation plan (maps to brief §12)
1. **This doc.** ✅
2. `shared/ranks.ts` (13 keys/positions/names/icon/colour/tier) + `shared` zod schemas +
   metadata unit test (13 unique keys/icons, order, icon adapter resolves in lucide 1.77.0).
3. Migration `0013_reputation.sql`: schema `reputation`, `rank_definitions` (seeded),
   `member_progress`, `xp_events` (append-only, unique idempotency), `rank_history`, `xp_daily`;
   scoring config in `rank_definitions`/config. (Forward-only; text ids; timestamptz.)
4. `backend/gateway/src/reputation.service.ts`: award engine (tx + `FOR UPDATE`, caps, idempotency
   `ON CONFLICT DO NOTHING`, rank derivation, multi-rank crossing) + unit tests.
5. Emit missing outbox events (`message.created`, `community.joined`, `profile.completed`,
   `moderation.sanction`) in existing controllers' transactions; wire `EventConsumer` worker with
   consumer group + ack + `evt:<type>:dlq`; dead-letter + metrics.
6. Read endpoints: public `GET /v1/users/:username/rank` (key only) + `rank` field in list payloads
   (Redis `MGET`); private `GET /v1/me/rank`, `/history`, `/activity`, `/requirements`,
   `POST /v1/me/seen`; owner-only SSE `rank.updated`/`rank.up`; `Cache-Control: private,no-store`;
   contract tests (public allowlist, no IDOR, 401).
7. Backfill npm script (`--dry-run` default, `--apply`), idempotent `backfill:v1:` keys, ceiling
   Pioneer, report distribution, set `rank_seen_key` to final.
8. Frontend `RankBadge`/`RankName` from `shared/ranks.ts`, Kaushan font, public profile integration
   (own = link, other = non-interactive, no XP), batched rank in lists.
9. Private `/profile/rank` page: header, progress, requirements, 13-rung ladder (Nobis bottom →
   Infinity top), history, activity (keyset), celebration once, states, mobile/desktop, nav
   registration in `lib/navigation.ts`.
10. Mocks (Nobis/Pioneer/Infinity/frozen; other-member public only), typed client `// PROPOSED`,
    `docs/frontend-api-needs.md`, blueprint update.
11. Full test run + Playwright screenshots + security checklist evidence.
12. Final report.

## 6. Future integration points (not fabricated)
Event check-in, project/campaign verified completion, badge awards — no data/emitter exists yet;
documented as future sources. No XP is invented for them.