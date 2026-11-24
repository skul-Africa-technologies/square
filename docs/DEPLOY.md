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
