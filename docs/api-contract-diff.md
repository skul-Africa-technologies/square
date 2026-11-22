# API Contract Diff

This document tracks breaking and non-breaking changes to the frontend/backend API contract.

## Current Contract

The frontend (`frontend/`) calls the backend through a typed mock API by default (`NEXT_PUBLIC_USE_MOCK=true`).
The real client (`frontend/lib/api/real.ts`) sends `credentials: "include"` for httpOnly cookies and a CSRF header on mutating requests.

## Path Mapping (legacy → new)

| Legacy | New |
|--------|-----|
| `apps/web/` | `frontend/` |
| `packages/shared/` | `shared/` |
| `packages/kernel/` | `backend/kernel/` |
| `services/<name>/` | `backend/<name>/` |
| `db/` | `backend/db/` |

## Change Log

### Shared reaction, mention, and unread contracts

- Added strict shared Zod schemas for reaction requests, user pages and SSE events; mention
  records, seen requests and mentionable-member pages; and unread summaries.
- The associated shared TypeScript types are inferred from the Zod schemas. The mock API and real
  API client validate these shapes, and the gateway reaction controller validates its route/query
  inputs and response/event shapes using the same schemas.
- Reaction write endpoints continue to return HTTP 204; the frontend client exposes the existing
  `{ ok: true }` method result after the successful response. No route or persistence contract was
  changed.
- This is a partial contract migration. Other frontend API methods still rely on TypeScript-only
  types, and most do not yet have real backend handlers. They remain explicit parity gaps.

### Differences confirmed against blueprint v1.1 (not yet resolved)

The following are inventory findings, not approved contract changes. The blueprint is authoritative
until an individual frontend contract is shown to be clearly better and both sides are updated.

| Area | Frontend contract | Blueprint v1.1 contract | Status |
|---|---|---|---|
| Verify code | `AuthVerifyCodeResponse` uses `isNewUser: boolean` with optional `user` and `signupTicket` | Discriminated existing-user and new-user responses | Unresolved shape difference |
| Username availability | `GET /users/username-available?username=` | `GET /users/username-available?u=` | Unresolved query-name difference |
| Bootstrap/unread | No `/me/bootstrap` client call; `/me/unread` is reduced to aggregate totals | `/me/bootstrap`; unread returns DM and per-asset summaries | Unresolved shape difference |
| Community leave/members | `DELETE /communities/:id/join`; grouped `CommunityMembers` response | `DELETE /communities/:slug/membership`; searchable member list | Unresolved path and shape differences |
| Asset read/permissions | `POST /assets/:id/read` omits `seq`; permissions use `/assets/:id/permissions` | Read requires `{seq}`; permissions belong to `PATCH /assets/:id` | Unresolved shape/path differences |
| Chat messages | `GET/POST /assets/:id/posts`, `Post` fields (`content`, `replyPreview`) | `GET/POST /assets/:id/messages`, message fields (`body`, `clientMsgId`) | Unresolved path and shape differences |
| Reaction realtime | Client subscribes to `/reactions/stream?scope=&roomId=` | Reactions are carried by the resumable `/me/stream` | Unresolved path difference; server route currently works independently |
| DMs | `/me/conversations`, message body `{text,...}` | `/dm/conversations`, message body `{body,...}` | Unresolved path and shape differences |
| Block/report | `/me/blocks` POST and `/me/reports` POST | `/users/:username/block` PUT and `/reports` POST with target fields | Unresolved path, verb and shape differences |
| Presence | `PATCH /me/presence` `{mode}` | `POST /me/presence` `{state}` | Unresolved method and shape differences |
| Search suggestions | `GET /search/suggested` | `GET /search/suggest?q=` | Unresolved path/query difference |
| Profiles | `/u/:username` and related subpaths; `User` includes `dob` | `/users/:username`; no DOB in user-facing responses | Unresolved path and privacy-shape differences |
| Privacy | `PATCH /me/privacy` `{showBirthday}` | `PATCH /me/settings` with `birthdayOptIn` and preferences | Unresolved path and shape differences |
| Uploads | `POST /uploads/sign` `{kind}`; no completion method | Sign requires kind/content type/bytes; complete endpoint required | Unresolved shape and missing-call difference |

Other missing or shape-different feature calls are enumerated by Appendix E row in
`docs/parity-matrix.md`. No mismatch in this table is marked resolved by the reaction/mention schema
increment above.
