# Frontend deployment

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

## Docker

From the repository root, build and run the optional image:

```sh
docker build -f infra/docker/frontend.Dockerfile -t square-frontend .
docker run --rm -p 3000:3000 -e PORT=3000 -e NEXT_PUBLIC_USE_MOCK=true square-frontend
```

The image uses Node 22 Alpine, installs production dependencies separately from
the build stage, and runs the frontend as a non-root user.
