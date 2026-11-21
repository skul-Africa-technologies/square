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

## 17 Database

Database schema and migrations live in `backend/db/migrations/`.
Seed data lives in `backend/db/seeds/`.

## 18 Infrastructure

Docker Compose (Postgres + Redis) lives in `infra/docker/docker-compose.yml`.
K6 load tests live in `infra/k6/`.
Ops runbooks live in `infra/ops/` and `docs/runbooks/`.
