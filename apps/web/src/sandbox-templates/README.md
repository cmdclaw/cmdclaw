# Sandbox Templates

This folder contains provider-specific sandbox images/snapshots used by cmdclaw.

- `common/` - Shared sandbox assets used by all providers.
- `e2b/` - E2B-specific template definition and build files.
- `daytona/` - Daytona snapshot build files.

Build commands (from `apps/web/`):

```bash
bun run e2b:build:dev
bun run e2b:build:prod
bun run e2b:build:staging
bun run daytona:build:dev
bun run daytona:build:prod
```
