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
