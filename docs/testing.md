# Testing

This repo uses a small root test surface with explicit buckets.

## Main commands

- `bun run test`
  Fast trusted rail. Runs `test:unit`, `test:integration`, and `test:e2e`.

- `bun run test:all`
  Full green guardrail. Runs `bun run test` plus the curated green live subset in `test:live`.

- `bun run test:live`
  Curated live subset. Currently this is the auth-backed live bootstrap path.

- `bun run test:ui`
  Single Vitest UI for the workspace Vitest packages. This is for local debugging, not CI.

## Current matrix

| Scope | In `test` | In `test:all` | Status |
| --- | --- | --- | --- |
| `test:unit` | yes | yes | green |
| `test:integration` | yes | yes | green |
| `test:e2e` | yes | yes | green |
| `test:live` | no | yes | green |
| quarantined files | no | no | red |
| `test:live:cli` | no | no | red |
| `test:live:web` | no | no | red |
| `test:prod` | no | no | red/env-dependent |
| `test:monitor` | no | no | red/env-dependent |
| `test:record` | no | no | red/long-running |
| `test:interactive` | no | no | manual |

## Current quarantine

- `apps/web/src/app/inbox/page.test.tsx`
- `apps/web/src/app/admin/credits/page.test.tsx`

These files are excluded from the green rail until they are debugged and reintroduced.

## How to run

From the repo root:

```bash
bun run test
bun run test:all
bun run test:live
bun run test:ui
```

For targeted buckets:

```bash
bun run test:live:cli
bun run test:live:web
bun run test:prod
bun run test:monitor
bun run test:record
bun run test:interactive
```

## Rule of thumb

- Use `bun run test` for fast regression protection.
- Use `bun run test:all` for the current full green baseline.
- Use `bun run test:ui` when you want one interactive Vitest view across packages.
- Treat the separate live/prod/manual buckets as diagnostic or recovery work until they are promoted into the guardrail.
