# Sandbox Workspace

This workspace owns CmdClaw sandbox runtime assets and sandbox build tooling.

Common commands:

```bash
bun run --cwd apps/sandbox e2b:build:dev
bun run --cwd apps/sandbox e2b:build:prod
bun run --cwd apps/sandbox e2b:build:staging
bun run --cwd apps/sandbox daytona:build:dev
bun run --cwd apps/sandbox daytona:build:prod
```

These commands load `/.env` from the repo root so sandbox builders keep using the same shared local environment as the web app.
