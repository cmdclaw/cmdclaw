# syntax=docker/dockerfile:1

FROM oven/bun:1.3.9 AS pruner
WORKDIR /app
RUN bun --version
COPY . .
RUN bun x turbo prune --scope=@cmdclaw/web --docker --out-dir /tmp/pruned
RUN bun -e 'const fs = require("fs"); for (const path of ["/tmp/pruned/json/package.json", "/tmp/pruned/full/package.json"]) { const pkg = JSON.parse(fs.readFileSync(path, "utf8")); pkg.workspaces = pkg.workspaces.filter((entry) => entry !== "docs"); fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`); }'
RUN mkdir -p /tmp/pruned/full/packages/config
RUN cp -R /app/packages/config/. /tmp/pruned/full/packages/config/

FROM oven/bun:1.3.9 AS builder
WORKDIR /app
COPY --from=pruner /tmp/pruned/json/ ./
RUN NODE_ENV=development bun install --frozen-lockfile --ignore-scripts
COPY --from=pruner /tmp/pruned/full/ ./
WORKDIR /app/apps/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ARG SKIP_ENV_VALIDATION=1
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV SKIP_ENV_VALIDATION=${SKIP_ENV_VALIDATION}
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY} \
    NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST}
RUN bun run build

FROM oven/bun:1.3.9 AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/next.config.ts ./next.config.ts
COPY --from=builder /app/apps/web/src/env.js ./src/env.js
COPY --from=builder /app/apps/web/src/sandbox-templates/common/skills ./src/sandbox-templates/common/skills
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/node_modules ./node_modules
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
EXPOSE 3000
CMD ["bun", "run", "start"]
