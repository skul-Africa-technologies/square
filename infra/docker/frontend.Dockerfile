FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
COPY frontend frontend
COPY shared shared
RUN pnpm install --frozen-lockfile
RUN pnpm build:frontend

FROM base AS production-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
COPY shared shared
RUN pnpm install --prod --filter @square/frontend... --frozen-lockfile

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=production-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=production-deps --chown=nextjs:nodejs /app/frontend/node_modules ./frontend/node_modules
COPY --from=production-deps --chown=nextjs:nodejs /app/frontend/package.json ./frontend/package.json
COPY --from=build --chown=nextjs:nodejs /app/frontend/next.config.mjs ./frontend/next.config.mjs
COPY --from=production-deps --chown=nextjs:nodejs /app/shared ./shared
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next ./frontend/.next
COPY --from=build --chown=nextjs:nodejs /app/frontend/public ./frontend/public
USER nextjs
EXPOSE 3000
CMD ["./frontend/node_modules/.bin/next", "start", "frontend", "-H", "0.0.0.0"]
