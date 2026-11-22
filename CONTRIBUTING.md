# Contributing to Square

## Development Setup

```bash
pnpm install
cp frontend/.env.example frontend/.env.local
pnpm dev
```

## Scripts

- `pnpm dev` – start frontend dev server (port 3000)
- `pnpm build` – production build
- `pnpm lint` – run ESLint
- `pnpm test` – run shared package unit tests (Vitest)
- `pnpm test:e2e` – run Playwright end-to-end tests (port 3100)

## Project Structure

- `frontend/` – Next.js frontend application
- `shared/` – Shared TypeScript types, schemas, and utilities
- `backend/kernel/` – Shared kernel (core domain types)
- `backend/db/` – Database schema and migrations
- `infra/` – Infrastructure and deployment configs
- `backend/*` – Backend services

## Commit Convention

Follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
