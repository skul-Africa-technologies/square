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

No contract changes yet. Initial monorepo structure.
