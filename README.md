# Square

Square — a campus-first platform for student builders. Monorepo with a Next.js frontend and placeholder backend services.

## Repository Layout

```
square/                          (repo root, single .git)
  frontend/                      Next.js app (moved from apps/web)
  backend/
    gateway/                     NestJS API gateway placeholder
    auth/  users/  badges/  communities/  assets/  chat/  dm/  feeds/
    events/  lists/  boards/  campaigns/  discover/  search/
    notifications/  realtime/  media/  moderation/
    kernel/                      shared backend code (built in Phase 0)
    db/
      migrations/  seeds/        (.gitkeep)
  shared/                        zod schemas, types, constants (shared by frontend + backend)
  docs/
    backend-blueprint.md  frontend-api-needs.md  api-contract-diff.md  CONTRIBUTING.md  runbooks/
  infra/
    docker/   k6/   ops/
  .github/workflows/ci.yml  PULL_REQUEST_TEMPLATE.md
```

## Stack

- Next.js App Router + TypeScript (strict), Tailwind CSS
- TanStack Query, react-hook-form + zod
- Monorepo: `frontend`, `shared`, `backend/*`

## Run

```bash
pnpm install
cp frontend/.env.example frontend/.env.local # optional, mock is default
pnpm dev
```

Open http://localhost:3000 (redirects to `/login`).

### Mock vs real API

- `NEXT_PUBLIC_USE_MOCK=true` (default when unset/when no API URL): typed mock client with seeded data.
- Set `NEXT_PUBLIC_USE_MOCK=false` and `NEXT_PUBLIC_API_URL` to use the real fetch client.

## Scripts

- `pnpm dev` – frontend dev server (port 3000)
- `pnpm dev:frontend` – frontend dev only
- `pnpm dev:backend` – placeholder (prints "backend not started")
- `pnpm dev:clean` – kill port 3000, clear caches, then dev
- `pnpm build` – build all packages
- `pnpm lint` – lint all packages
- `pnpm typecheck` – typecheck all packages
- `pnpm test` – run all tests
- `pnpm format` – format with Prettier
- `pnpm audit` – production audit (report only)

## Structure

- `frontend/app` – routes (`/login`, `/explore`, `/c/[community]/[asset]`, `/u/[username]`, `/settings`, `/project/[id]`, `/home`, `/inbox`)
- `frontend/components` – shared UI and app shell
- `frontend/features` – auth, communities, assets, dm, home, profile
- `frontend/lib` – API client, session/CSRF helpers, mock/real implementations
- `shared/src` – username rules/config, domain types, validation schemas
- `backend/*` – placeholder backend services

## Conventions

- `main` is always deployable
- Short-lived branches: `feat/<scope>-<topic>`, `fix/<scope>-<topic>`, `chore/<scope>-<topic>`
- Squash merge, conventional commit titles
- Releases tagged `v0.x.y`
