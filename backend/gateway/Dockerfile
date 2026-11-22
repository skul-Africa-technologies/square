FROM node:22-bookworm-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm build:backend

ENV NODE_ENV=production
EXPOSE 4000
USER node

CMD ["pnpm", "start:backend"]
