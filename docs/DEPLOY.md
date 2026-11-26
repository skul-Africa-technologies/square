# Frontend deployment

## Backend production readiness

The current deployment instructions and root `build`/`start` scripts cover the
frontend only. The gateway can be started with `pnpm dev:backend` or
`pnpm start:backend`, but it is **not production-ready**: significant blueprint
routes, authorization checks, service profiles and parity tests are still
missing. Authentication now uses generated email codes, signed sessions and
refresh-token rotation, but student verification is not implemented and other
auth workflows remain incomplete. See [the parity audit](./parity-matrix.md) for the frontend
feature-by-feature gaps and [the backend blueprint](./backend-blueprint.md)
for the target contract. Signup asks users to self-report whether they are
students or alumni; that choice does not verify student status or grant a
verification badge.

## Database schemas and migrations

Run `pnpm db:migrate` to apply pending SQL migrations. Run `pnpm db:status` to
show the migration count and application tables visible through both
`DATABASE_URL` and `DIRECT_URL`; the command does not print either connection
string. Application tables are intentionally separated into schemas such as
`users`, `identity`, `communities`, `chat`, and `dm`, not placed in `public`.
If a database dashboard is filtered to `public`, it can appear empty even when
the application tables exist; expand/select the application schemas instead.

Migration `0011_institution_directory.sql` adds searchable institution
metadata, aliases, trigram indexes and the self-reported education status.
The existing four institutions are only an initial directory, not a complete
registry; add a vetted institution dataset before presenting it as exhaustive.
Search is backed by PostgreSQL `pg_trgm` indexes over names and aliases.

The root `.env.example` documents variables currently parsed by the backend.
It is not a production deployment recipe: setting those variables does not
implement missing auth, endpoint, worker or launch-profile behavior. Keep the
frontend in mock mode until the parity requirements pass against the real API.

## Pxxl

Configure the service to build from the repository root:

- **Root directory:** repository root
- **Node version:** 22 or newer (`.nvmrc` is `22`)
- **Install command:** `pnpm install --frozen-lockfile`
- **Build command:** `pnpm build`
- **Start command:** `pnpm start`
- **Port:** `PORT` (the server binds to `0.0.0.0`; defaults to `3000`)
- **Environment variables:**
  - `NEXT_PUBLIC_USE_MOCK=true` for the frontend mock API when no backend is deployed.
  - `NEXT_PUBLIC_API_URL` is required when `NEXT_PUBLIC_USE_MOCK=false`.

Set `NEXT_PUBLIC_*` values for the build as well as the running service because
Next.js embeds public variables during the production build. The mock API is the
default if neither variable is set. Invalid `NEXT_PUBLIC_USE_MOCK` values and a
missing API URL in real-API mode fail the build with an explanatory error.

The root `build` and `start` scripts deploy only the frontend. The frontend is
built into the default `.next` directory and started on the platform-provided
`PORT`. The dev server uses `.next-dev`; frontend local build checks instead
pair `.next-build` for build and start, and end-to-end checks use `.next-e2e`.
The health check is available at `GET /api/health`.

The backend API is built with `pnpm build:backend` and started with
`pnpm start:backend`. A separate outbox worker process can be started from the
same build with `pnpm start:worker`; it publishes committed domain events to
Redis Streams. Both processes require the backend environment variables and a
completed database migration. The worker does not replace the missing realtime
service or the remaining product endpoints.

For local Docker deployment, `docker compose --profile launch up --build`
starts the gateway and the separate outbox worker. The worker waits for the
gateway readiness check, which also ensures its startup migration has finished.

## Real-backend parity tests

`pnpm backend:up` starts an isolated `square-parity` Docker Compose project with
Postgres, Redis, and the gateway (published on ports 4400, 56379, and 55432),
waits for `GET /readyz`, and seeds the
deterministic login account used by the parity suite. It generates an
ephemeral JWT keypair for this test stack; no key files or `.env` files are
used. `pnpm backend:down` stops the stack while preserving its test volume.
`pnpm backend:reset` recreates that isolated volume and seed state.

Run `pnpm parity:mock` to exercise the shared login/signup suite against the
frontend mock, `pnpm parity:real` to reset the test stack and run it against the
gateway, or `pnpm parity` to run both. The real-backend test mode sets
`AUTH_TEST_MODE=true` only with `NODE_ENV=test`, where the verification code is
`123456`. Backend configuration rejects that flag in every other environment;
the production launch profile does not enable it. Never set the flag in a
deployed environment.

## Docker

From the repository root, build and run the optional image:

```sh
docker build -f infra/docker/frontend.Dockerfile -t square-frontend .
docker run --rm -p 3000:3000 -e PORT=3000 -e NEXT_PUBLIC_USE_MOCK=true square-frontend
```

The image uses Node 22 Alpine, installs production dependencies separately from
the build stage, and runs the frontend as a non-root user.

## Backend production deployment

The gateway (`backend/gateway`) and worker run from the same image
(`backend/gateway/Dockerfile`, `node:22-bookworm-slim`, non-root `node` user,
port 4000). The image entrypoint runs `pnpm --filter @square/gateway migrate`
then `pnpm start:backend`; the worker overrides the command with
`pnpm start:worker`.

### 1. Required infrastructure
- PostgreSQL 16+ reachable with TLS (`sslmode=require`).
- Redis 7+ reachable with TLS (`rediss://`) and Streams support.
- A container runtime/orchestrator that can run two replicas from one image
  (gateway + worker) and terminate them gracefully.
- An HTTPS edge/load balancer in front of the gateway (TLS termination).

### 2. Required environment variables
See `.env.example`. In production the config (`backend/kernel/src/config.ts`)
**fails fast** unless all of these are set: `NODE_ENV=production`,
`DATABASE_URL` (with `sslmode=require`), `REDIS_URL` (`rediss://`),
`CORS_ORIGINS` (HTTPS only), `METRICS_TOKEN` (≥32 chars),
`JWT_PUBLIC_KEY` + `JWT_PRIVATE_KEY` (Ed25519 PEM), `AUTH_CODE_PEPPER` (≥32),
`RESEND_API_KEY` + `RESEND_SENDER_EMAIL`. `AUTH_DEV_BYPASS` must never be set.

### 3. Generate JWT keys securely
```sh
openssl genpkey -algorithm ed25519 -out jwt_private.pem
openssl pkey -in jwt_private.pem -pubout -out jwt_public.pem
```
Store the private key in your secret manager; inject both as env vars.

### 4. PostgreSQL
Use a managed Postgres with TLS and a connection pooler. `DATABASE_URL` points
at the pooler (transaction mode), `DIRECT_URL` at a session-mode endpoint for
migrations. Application tables live in schemas (`users`, `identity`,
`communities`, `chat`, `dm`, `assets`, `feeds`, `events`, `lists`, `boards`,
`campaigns`, `moderation`, `kernel`), not `public`.

### 5. Redis
Use a managed Redis with TLS (`rediss://`). The app uses `pg_notify` +
`LISTEN` (Postgres) for SSE and Redis for rate limiting, session deny-list, and
streams. Redis must support `EVAL` (Lua), `XADD`/`XREADGROUP`/`XACK`, and
`SET`/`GET`/`INCR`.

### 6. Run migrations
Migrations are hand-written SQL in `backend/db/migrations/`, applied in order by
`backend/gateway/src/migrate.ts`. The runner takes a Postgres advisory lock
(`pg_advisory_lock`) so **multiple replicas can run it concurrently safely** —
the second replica waits, then sees the schema up to date and exits. The gateway
container runs migrate before start, so schema is always current on rollout. To
run manually: `pnpm db:migrate` (status: `pnpm db:status`).

### 7. Build the image
```sh
docker build -f backend/gateway/Dockerfile -t square-gateway .
```

### 8. Deploy the gateway
Run N gateway replicas from the image (env from your secret manager). The
container migrates-then-starts; readiness is `GET /readyz` (checks Postgres +
Redis). Liveness is `GET /healthz`.

### 9. Deploy the worker
Run the worker from the **same image** with command `pnpm start:worker`. It
relays committed outbox events to Redis Streams and recovers pending work on
restart. It must share `DATABASE_URL`/`REDIS_URL` with the gateway.

### 10. Frontend API URL
Set `NEXT_PUBLIC_USE_MOCK=false` and `NEXT_PUBLIC_API_URL=https://api.example.com/v1`
at **build time** (Next.js embeds public vars in the bundle).

### 11. CORS and cookies
`CORS_ORIGINS` must list the exact frontend HTTPS origins. Cookies use
`__Host-sq` (or `__Secure-sq` with `COOKIE_DOMAIN`), `HttpOnly`, `Secure`,
`SameSite=Lax`. CSRF uses a double-submit token (`X-Square-CSRF`).

### 12. Verify health and readiness
`GET /healthz` → `{status:"ok"}`. `GET /readyz` → 200 when Postgres+Redis are
reachable, 503 otherwise. `GET /metrics` (protected by `METRICS_TOKEN`).

### 13. Monitor logs and metrics
Structured JSON logs with request ids (`X-Request-Id`); auth/cookie/url headers
are redacted. Prometheus metrics at `/metrics` (`square_http_requests_total`,
`square_http_request_duration_seconds`).

### 14. Rollback
Redeploy the previous image tag. Migrations are forward-only and transactional;
rolling back the image does not revert schema. Restore the DB from backup if a
migration must be undone.

### 15. Backup and restore
Use your Postgres provider's PITR/backup. Test restores regularly. The
`kernel.schema_migrations` table tracks applied migrations; a restored backup
must be consistent with the image's migration set.

### Remaining work before production
Uploads (Cloudinary signing) are not implemented — keep `UPLOADS_ENABLED=false`.
Several blueprint routes and full launch-profile behavior remain incomplete (see
`docs/parity-matrix.md`). No CD pipeline exists; deploy via your orchestrator.
External dependencies (Resend, Cloudinary, managed Postgres/Redis TLS) must be
verified in your environment.
