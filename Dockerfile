# ==============================================================
# PM CONTROL TOWER — Production image
# Multi-stage build on Bun (runs TS natively for seeds/realtime,
# Node-compatible standalone server for the Next.js app).
#
# Build : docker build -t pm-control-tower:1.0.0 .
# Run   : docker compose up -d       (recommended — app + realtime + volume)
# ==============================================================

# ---------- Stage 1: dependencies ----------
FROM oven/bun:1.2-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
# Full install (dev deps included) — needed for prisma CLI and next build
RUN bun install --frozen-lockfile

# ---------- Stage 2: build ----------
FROM oven/bun:1.2-slim AS build
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Realtime gateway is an independent bun project with its own lockfile
RUN bunx prisma generate \
 && bun run build \
 && cd mini-services/realtime && bun install --frozen-lockfile

# ---------- Stage 3: runtime ----------
FROM oven/bun:1.2-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Full node_modules: prisma CLI (db push at boot), tsx, and a resilient
# Prisma client fallback for the standalone server.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/package.json ./package.json

# Next.js standalone server (build script already copied static+public inside)
COPY --from=build /app/.next/standalone ./server

# Operational assets: prisma schema, seeds, realtime gateway, entrypoint
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/mini-services ./mini-services
COPY --from=build /app/mini-services/realtime/node_modules ./mini-services/realtime/node_modules
COPY deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
 && mkdir -p /app/db

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/api/system/ready || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "server/server.js"]
