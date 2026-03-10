# syntax=docker/dockerfile:1

FROM oven/bun:1.3.9 AS deps
WORKDIR /app
RUN bun --version
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/ws/package.json ./apps/ws/package.json
COPY docs/package.json ./docs/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
RUN bun install --frozen-lockfile --ignore-scripts

FROM oven/bun:1.3.9 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN NODE_ENV=development bun install
RUN bun run --cwd apps/worker bundle
WORKDIR /app/apps/worker
CMD ["bun", "dist/index.js"]
