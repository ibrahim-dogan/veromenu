# syntax=docker/dockerfile:1.7
# VeroMenu production image: Next.js standalone server + bundled migrate/seed scripts.
#   docker build -t veromenu .
#   docker compose up -d --build        (see docs/DEPLOYMENT.md)
#
# Debian bookworm-slim (glibc) is used on purpose: sharp and @node-rs/argon2 ship prebuilt
# linux-x64/arm64 glibc binaries, so no compiler toolchain is needed.

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
# pnpm version comes from package.json "packageManager".
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Optional, for multi-instance deployments (all instances must share the key):
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY}
# No real secrets at build time. The DB client is created lazily and never connects during the build;
# runtime config (APP_URL, APP_SECRET, LEGAL_* …) is read when pages are rendered.
# The placeholder APP_SECRET only satisfies env() validation in modules evaluated while Next collects
# page config – it is NOT baked into the image (it only lives in this RUN step); the real one comes from .env.
RUN DATABASE_URL="postgres://build:build@127.0.0.1:5432/build" \
    APP_SECRET="build-time-placeholder-not-used-at-runtime-0000" \
    pnpm build \
 && node scripts/build-scripts.mjs

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    STORAGE_DRIVER=local \
    STORAGE_LOCAL_DIR=/app/data/uploads
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Standalone server (traced node_modules incl. sharp, argon2, postgres) – .next must stay writable for the ISR cache.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# i18n messages are read from process.cwd()/src/messages at runtime (src/core/i18n/messages.ts).
COPY --from=builder /app/src/messages ./src/messages
# SQL migrations + bundled scripts (node dist-scripts/migrate.cjs | seed.cjs).
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/dist-scripts ./dist-scripts
COPY --chmod=755 docker/entrypoint.sh /app/docker/entrypoint.sh

RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/robots.txt').then(r=>r.ok?r:fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/')).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["node", "server.js"]
