# Square (frontend)

Frontend-only implementation of **Square** — a campus-first platform for student builders. The backend is separate; this app runs against a typed mock API by default.

## Stack
- Next.js App Router + TypeScript (strict), Tailwind CSS
- TanStack Query, react-hook-form + zod
- Monorepo: `apps/web`, `packages/shared`

## Run
```bash
npm install
cp apps/web/.env.example apps/web/.env.local # optional, mock is default
npm run dev
```
Open http://localhost:3000 (redirects to `/login`).

### Mock vs real API
- `NEXT_PUBLIC_USE_MOCK=true` (default when unset/when no API URL): typed mock client with seeded data (Web3 Club, Design Lab, Campus Builders, AI Circle, Robotics, Founders Hub; channels general/smart-contracts/campus-dapps/opportunities; users #amaka-eze, #tunde-ade, #kemi-obi, #victory-gray; sample projects and Tester Drive campaign).
- Mock auth: most 6-digit codes verify as new-user flow (e.g. `123456`); `111111` verifies as existing account; `000000` => expired; `999999` => cancelled/too-many-tries. Reserved usernames (amaka-eze, tunde-ade, kemi-obi, victory-gray, admin, square) show as taken.
- Set `NEXT_PUBLIC_USE_MOCK=false` and `NEXT_PUBLIC_API_URL` to use the real fetch client (`credentials: "include"` for httpOnly cookies, CSRF header on mutating requests).

## Scripts
- `npm run dev` – web dev server
- `npm run build` – production build
- `npm run lint` – Next lint + eslint security plugin
- `npm run test` – shared package unit tests (Vitest)
- `npm run test:e2e` – Playwright happy path (`npx playwright install`)
- `npm run audit` – `npm audit --audit-level=high`
- `npm run analyze` – bundle analyzer build

## Performance & security notes
- Server Components by default; client components only for interactive flows. `next/font` with `display: swap`; `next/image` for mascot/logo with sizing. Links use `prefetch={false}` to avoid eager prefetch; TanStack Query tuned (staleTime/dedupe/backoff).
- Chat polls with `after` cursor and backs off when tab hidden; simple windowing for long lists and bounded leaderboard rendering; optimistic updates for posting/campaign actions; skeletons for loading states.
- Session tokens intended for httpOnly Secure cookies only (never localStorage/JS-readable). Mock establishes session via server route `/api/session`. Real client sends `credentials: "include"` and CSRF header (`x-csrf-token` placeholder) on mutations.
- Security headers and CSP configured in `apps/web/next.config.ts`; no inline scripts in app code, no `dangerouslySetInnerHTML`; uploads validated client-side (type/size) but server is authority; generic auth error messaging; auth actions disabled in-flight with retry countdown.
- No secrets in `NEXT_PUBLIC_*`; avoid logging tokens/emails.

## Structure
- `apps/web/app` – routes (`/login`, `/explore`, `/c/[community]/[channel]/[tab]`, `/u/[username]`, `/settings`, `/project/[id]`, `/home`, `/inbox`)
- `apps/web/components` – shared UI and app shell
- `apps/web/features` – auth, communities, channels/tabs, posts, projects, campaigns, profile
- `apps/web/lib` – API client, session/CSRF helpers, mock/real implementations, upload validation
- `packages/shared` – username rules/config, domain types, validation schemas
