# Contributing to Square

## Development Setup

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev
```

## Scripts

- `npm run dev` – start web dev server (port 3000)
- `npm run build` – production build
- `npm run lint` – run ESLint
- `npm run test` – run shared package unit tests (Vitest)
- `npm run test:e2e` – run Playwright end-to-end tests (port 3100)

## Project Structure

- `apps/web/` – Next.js frontend application
- `packages/shared/` – Shared TypeScript types, schemas, and utilities
- `packages/kernel/` – Shared kernel (core domain types)
- `db/` – Database schema and migrations
- `infra/` – Infrastructure and deployment configs
- `services/` – Backend services

## Commit Convention

Follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
