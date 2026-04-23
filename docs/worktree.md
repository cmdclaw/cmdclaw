# Worktrees

This repo has a dedicated worktree flow for running isolated app processes and, now, isolated local Docker stacks.

## When to use it

Use a worktree when you want to run multiple copies of CmdClaw side by side without port collisions between:

- the web app
- the worker
- the WS runtime
- Postgres
- Redis
- MinIO
- local observability ports such as Jaeger and OTEL
- Daytona ports when that profile is enabled

## Main idea

Each worktree gets:

- a stable `instanceId`
- its own app and WS ports
- its own database name
- its own Redis namespace
- a 2-digit stack slot used to derive Docker ports such as `54xx`, `63xx`, `91xx`, and `92xx`
- its own Docker Compose project name and Docker volumes

Example:

- slot `07` maps to Postgres `5407`
- slot `07` maps to Redis `6307`
- slot `07` maps to MinIO API `9107`
- slot `07` maps to MinIO console `9207`

## Start a worktree app

From inside the worktree:

```bash
bun run worktree:docker-up
bun run worktree:create
bun run worktree:start
```

This starts the worktree-scoped Docker services first, then creates the isolated worktree metadata, database, env file, and starts the web, worker, and WS processes for that worktree.

Each worktree writes a computed `.env` file at the repo root. That file is the authoritative runtime env for worktree commands and normal repo scripts inside that worktree, including Docker Compose, `worktree:start`, `worktree:dev`, and `bun run cli ...`.

## Start a worktree Docker stack

If the worktree also needs its own local Postgres, Redis, MinIO, and observability services, use the worktree-aware Docker command instead of plain `docker compose up`:

```bash
bun run worktree:docker-up
```

That command resolves the worktree slot first, then starts Compose with the worktree-specific ports, project name, passwords, and volumes.

To stop that stack:

```bash
bun run worktree:docker-down
```

## Inspect the assigned values

To see the current worktree assignment:

```bash
bun run worktree:status
bun run worktree:env
```

`worktree:status` shows the instance id, stack slot, app URL, database name, Docker project, and all derived local addresses for Postgres, Redis, MinIO, metrics, logs, traces, Grafana, Alertmanager, and OTEL.

It also shows the exact `.env` path currently backing the worktree.

`worktree:env` prints the full derived environment for the worktree, including:

- `DATABASE_URL`
- `REDIS_URL`
- `AWS_ENDPOINT_URL`
- `CMDCLAW_POSTGRES_PORT`
- `CMDCLAW_REDIS_PORT`
- `CMDCLAW_MINIO_API_PORT`
- `CMDCLAW_MINIO_CONSOLE_PORT`
- `CMDCLAW_COMPOSE_PROJECT`

## Important rule

For the main repo checkout, plain Docker commands are still fine:

```bash
docker compose -f docker/compose/dev.yml up -d
```

For a worktree checkout, use:

```bash
bun run worktree:docker-up
```

Otherwise Compose will use the shared root `.env` values and you can still get port collisions.

## Run the CLI in a worktree

When you run the root CLI script from inside a worktree, the generated root `.env` makes the normal CLI path point at the worktree app URL and local database without manual exports or a wrapper.

Example:

```bash
bun run worktree:docker-up
bun run worktree:create
bun run worktree:start
bun run cli chat --message "hi" --model openai/gpt-5.4-mini
```
