# Backend Blueprint

## 3.5 Service Layout

Backend services live under `backend/`, one folder per service:

- `backend/gateway/` — API gateway (NestJS entry point)
- `backend/auth/`, `backend/users/`, `backend/badges/`, `backend/communities/`
- `backend/assets/`, `backend/chat/`, `backend/dm/`, `backend/feeds/`
- `backend/events/`, `backend/lists/`, `backend/boards/`, `backend/campaigns/`
- `backend/discover/`, `backend/search/`, `backend/notifications/`
- `backend/realtime/`, `backend/media/`, `backend/moderation/`
- `backend/kernel/` — shared backend code (built in Phase 0)
- `backend/db/` — migrations and seeds

Each service is an independent package named `@square/<service>`.

## 6 Data Model

### 6.6 Community chat

Community messages are stored in `chat.messages`. Reactions are normalized and scoped to a message:

```sql
chat.reactions(
  message_id text NOT NULL,
  user_id text NOT NULL,
  emoji varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
)
```

Indexes: `(message_id, emoji, created_at)` and `(user_id, message_id)`.
`chat.reaction_counts(message_id, emoji, count int, first_at timestamptz)` has primary key
`(message_id, emoji)` and is maintained in the same transaction as each reaction change. Message
reads use these counts rather than grouping raw reaction rows. A nightly reconcile recomputes counts
from `chat.reactions`.

Mentions are stored once per mentioned user and message:

```sql
chat.mentions(
  user_id text NOT NULL,
  asset_id text NOT NULL,
  message_id text NOT NULL,
  seq bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NULL,
  PRIMARY KEY (user_id, message_id)
)
```

Indexes: `(user_id, asset_id, seen_at)` and the partial index
`(user_id, asset_id) WHERE seen_at IS NULL`. A message can create at most five mention rows.
The Redis hash `ment:{userId}` stores `assetId -> unseen count` as the fast path; rebuild it from
`chat.mentions` after loss or inconsistency.

### 6.7 Direct messages

`dm.reactions` and `dm.reaction_counts` have the same columns, keys, indexes, and transactional
maintenance as their `chat` counterparts, keyed by the direct-message message id. Direct-message
reactions are visible only to the conversation participants.

`dm.mentions` has the same columns, primary key, and indexes as `chat.mentions`, with
`conversation_id` in place of `asset_id`. The `ment:{userId}` Redis hash also stores DM conversation
unseen counts; rebuild these entries from `dm.mentions`.

## 8 Domain Rules

### 8.1 Unread summaries

Unread summaries return `{unread, mentions}` per asset and DM conversation; `unread` is the total
unread message count and `mentions` is the subset that mentions the current user. The UI shows the
unread number only when `mentions` is zero; when all unread messages are mentions, it shows `@`
alone for one mention or `@` with the mention count for multiple mentions; when both kinds exist,
it shows `@` with the total unread number.

Opening a chat does not mark mentions seen. The client reports mentions seen when they are visible
or the user jumps to them. When leaving an asset or DM, the client marks all mentions for that visit
seen with `POST .../mentions/seen { all: true }`; this request is safe to send with `sendBeacon` or
`fetch` using `keepalive`.

### 8.12 Mention parsing

- Parse `@username` tokens outside code spans, using the same username character rules (letters,
  emoji, and hyphens). Preserve the message text as sent.
- Resolve community mentions only against members who can read the asset, and DM mentions only
  against the other conversation participant. Ignore self-mentions, unknown names, and names the
  caller cannot mention because of visibility or blocking.
- Store at most five distinct mentions per message. Ignore the sixth and any later mentions; do not
  fail the message request.
- Insert mention rows in the same transaction as the message and write
  `mention.created {userId, assetId, messageId, seq}` to the outbox.
- On message edit, create rows and notifications only for newly added mentions.

### 8.13 Mention autocomplete

`GET /assets/:id/mentionable?q=&limit=&cursor=` returns batch-hydrated user cards for members who
can read the asset. A mods-only asset returns only owners and moderators. Exclude the caller and
anyone who blocked or is blocked by the caller. With an empty query, rank the last 200 speakers from
the Redis zset `act:{assetId}` first, then list everyone else alphabetically. With a query, rank
username prefix matches before trigram contains matches. Use keyset pagination on `(rank, id)`.
Keep response time within a 150 ms budget and rate-limit to 120 requests per minute.

`GET /dm/conversations/:id/mentionable` returns only the other conversation participant.

### 8.16 Reactions

- **Emoji:** accept only allowlisted, fully-qualified RGI Unicode emoji from `shared`, including
  valid skin-tone sequences. Reject text-presentation forms, custom emoji, values over 32 bytes, and
  any sequence outside the generated Unicode emoji list. Return `emoji_not_allowed`.
- **Limits:** at most 20 distinct emoji on a message and 10 reactions by one user on a message.
  Return `reaction_limit_reached` when either limit would be exceeded.
- **Add:** `PUT` is idempotent. In one transaction, insert into `reactions` with
  `ON CONFLICT DO NOTHING RETURNING 1`. Only when inserted, increment or create the corresponding
  `reaction_counts` row and write the outbox event. `first_at` is set on the first insert.
- **Remove:** delete the user's row and decrement its count in the same transaction; delete the
  count row when it reaches zero. Adding an existing reaction and removing an absent reaction are
  no-ops returning 204.
- **Message reads:** return `reactions: [{emoji, count, me}]`, ordered by `first_at`. Hydrate each
  page with two indexed lookups: counts for `message_id = ANY($ids)` and the requesting user's
  rows for `user_id = $me AND message_id = ANY($ids)`. Do not use read-time `GROUP BY` or N+1
  queries.
- **Who reacted:** `GET /messages/:id/reactions/:emoji/users?cursor=` uses keyset pagination on
  `(created_at, user_id)`. Filter users blocked in either direction and batch-hydrate user cards.
- **Permissions:** community add/remove requires `A:post`; read-only users and non-members receive
  `asset_forbidden`. DMs require participant status and no block (`dm_blocked`). Banned and timed-out
  community members cannot react. Tombstoned messages return `not_found`.
- **Moderation:** community moderators can clear one emoji or all reactions on a message. Each clear
  writes an audit log row. There are no moderator-clear operations in DMs.
- **Realtime:** publish `reaction.updated {scope, roomId, messageId, emoji, count, op, userId}` only
  to viewers of the asset room or the two DM participants. A resync event restores counts after a
  reconnect gap. The gateway authorizes each room subscription and closes it if access is revoked.
- **Notifications:** disabled by default (`ENABLE_REACTION_NOTIFICATIONS=false`). When enabled,
  aggregate at most one notification per message per 10 minutes, such as
  `#tunde and 3 others reacted ❤️`.
- **Anti-abuse:** apply 60 requests/minute per user, a burst limit of 5 per 3 seconds, and a
  trust-level-0 limit of 20 reactions/minute. Who-reacted requests are limited to 60/minute.
  Rejected bursts return `rate_limited`.

## 10 Threat Model

| Threat | Mitigation |
|---|---|
| Reaction spam and count inflation | Unique key, per-message and per-user limits, rate limits, trust levels, transactional count updates, nightly reconciliation |
| Mention spam and harassment | Maximum five mentions per message, rate limits, blocks respected in autocomplete and parsing, and trust-level limits (trust level 0 can mention at most two people per message) |

## 13 Events

| Event | Producer | Consumers |
|---|---|---|
| `mention.created` | chat or dm | inbox notifications and realtime live counters |
| `reaction.updated` | chat or dm | authorized realtime room viewers |
| `reaction.toggled` | chat or dm | audit and badges only |

The inbox notification kind for a mention is `mention`.
`reaction.updated` carries the resulting count and is room-scoped. `reaction.toggled` is not sent to
room clients.

## 14 Rate Limits

| Operation | Limit |
|---|---:|
| Mentionable reads, per user | 120/minute |
| Mention-seen writes, per user | 60/minute |
| Reaction writes, per user | 60/minute |
| Reaction write burst | 5/3 seconds |
| Reaction writes for trust level 0 | 20/minute |
| Who-reacted reads, per user | 60/minute |

## 15 API

Reaction and mention routes are added to the existing API surface; the endpoint inventory increases
by sixteen routes (nine reaction routes and seven mention routes). There is no `endpoints.json` in
the repository; this section is the authorization-matrix source for these routes.

### 15.7 Community chat

| Method | Path | Access | Behavior |
|---|---|---|---|
| PUT | `/messages/:id/reactions/:emoji` | `A:post` | Idempotently add my reaction |
| DELETE | `/messages/:id/reactions/:emoji/me` | `A:post` | Remove my reaction |
| GET | `/messages/:id/reactions/:emoji/users?cursor=` | `A:read` | Paginated who-reacted list |
| DELETE | `/messages/:id/reactions/:emoji` | `C:mod` | Clear this emoji and audit |
| DELETE | `/messages/:id/reactions` | `C:mod` | Clear all reactions and audit |
| GET | `/assets/:id/mentions?unread=true` | `A:read` | `[{ messageId, seq, createdAt }]` for unseen mentions |
| POST | `/assets/:id/mentions/seen` | `C:member` | `{ messageIds: string[] }` or `{ all: true }` |
| GET | `/assets/:id/mentionable?q=&limit=&cursor=` | `A:post` | Paginated members who can be mentioned |

### 15.8 Direct messages

| Method | Path | Access | Behavior |
|---|---|---|---|
| PUT | `/dm/messages/:id/reactions/:emoji` | Participant, unblocked | Idempotently add my reaction |
| DELETE | `/dm/messages/:id/reactions/:emoji/me` | Participant, unblocked | Remove my reaction |
| GET | `/dm/messages/:id/reactions/:emoji/users?cursor=` | Participant, unblocked | Paginated who-reacted list |
| GET | `/dm/conversations/:id/mentions?unread=true` | Participant | `[{ messageId, seq, createdAt }]` for unseen mentions |
| POST | `/dm/conversations/:id/mentions/seen` | Participant | `{ messageIds: string[] }` or `{ all: true }` |
| GET | `/dm/conversations/:id/mentionable?q=&limit=&cursor=` | Participant | Return the other conversation participant |

DMs do not have moderator-clear routes.

### 15.9 Reaction realtime

| Method | Path | Access | Behavior |
|---|---|---|---|
| GET (SSE) | `/reactions/stream?scope=asset&roomId=:id` | `A:read` | Initial resync and updates for authorized asset viewers |
| GET (SSE) | `/reactions/stream?scope=dm&roomId=:id` | Participant, unblocked | Initial resync and updates for the two participants |

### 15.16 Unread summaries

| Method | Path | Access | Behavior |
|---|---|---|---|
| GET | `/me/unread` | Authenticated | `{ dm: { unread, mentions }, assets: [{ assetId, unread, mentions }] }` |

## 17 Database and Delivery Plan

Database schema and migrations live in `backend/db/migrations/`.
Seed data lives in `backend/db/seeds/`.

### Phase 3: Chat, DMs, and realtime

The Phase 3 implementation includes community and DM reaction and mention tables, APIs, access
checks, transactional counts and mention rows, outbox events, mention counters and seen endpoints,
mentionable member lookup, and authorized realtime delivery.

**Exit criteria**

- Idempotent add and remove; count rows equal reaction rows after 50 concurrent toggle requests.
- The 21st distinct emoji and the per-user limit are rejected.
- Read-only users and non-members cannot react; blocked DM participants cannot react.
- Deleted messages reject reaction operations.
- Who-reacted pagination is stable, excludes blocked users, and returns hydrated user cards.
- Realtime updates reach only viewers of the subscribed room; reconnect resync restores counts.
- Mention parsing handles code spans, emails, duplicates, unknown names, blocked users, and
  non-readable users; the sixth mention is ignored.
- Editing a message creates rows and notifications only for new mentions.
- Mentions are not marked seen on open; leaving an asset or DM marks all mentions for that visit
  seen, and visible or jumped-to mentions are marked seen.
- Mention counters match mention rows after concurrent messages.
- Mentionable lookup excludes blocked users and respects mods-only asset visibility.
- The authorization matrix has a test row for every endpoint in Sections 15.7 and 15.8.

**Phase 3 Kilo prompt**

Implement the reaction and mention schemas, indexes, transactional count and mention-row
maintenance, nightly reconciliation, emoji allowlist validation, mention parsing and autocomplete,
unread counters and seen endpoints, permissions, rate limits, and room-authorized realtime events
described in Sections 8.12, 8.13, and 8.16. Add tests for idempotent reaction add/remove; count
consistency after 50 parallel toggle requests; the 21st distinct emoji and per-user limits;
read-only and non-member rejection; blocked DM rejection; tombstoned-message rejection;
who-reacted pagination; mention parsing edge cases (code spans, emails, duplicates, unknown names,
blocked users, and non-readable users); the ignored sixth mention; edits adding only new mentions;
leave-marks-all-seen semantics; counters matching mention rows after concurrent messages;
mentionable exclusion of blocked users and mods-only visibility; realtime delivery only to room
viewers; reconnect resync; and an authorization-matrix row for every new endpoint.

## 18 Infrastructure

Docker Compose (Postgres + Redis) lives in `infra/docker/docker-compose.yml`.
K6 load tests live in `infra/k6/`.
Ops runbooks live in `infra/ops/` and `docs/runbooks/`.

## Appendix B: Error Codes

| Code | Meaning |
|---|---|
| `emoji_not_allowed` | Emoji is not an allowed fully-qualified RGI Unicode sequence |
| `reaction_limit_reached` | Message distinct-emoji or per-user reaction limit reached |
