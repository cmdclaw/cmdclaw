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
bun run worktree:setup
```

This fails fast if Docker is not installed or the Docker daemon is not running. Otherwise it starts the worktree-scoped Docker services, waits for Postgres to become ready, creates the isolated worktree metadata, database, and env file, and starts the web, worker, and WS processes for that worktree.

Each worktree writes a computed `.env` file at the repo root. That file is the authoritative runtime env for worktree commands and normal repo scripts inside that worktree, including `worktree:setup`, `worktree:dev`, and `bun run cli ...`.

## Start only the Docker stack

If you only want the worktree-scoped Docker services without starting the app processes:

```bash
bun run worktree:docker-up
```

## Stop the worktree Docker stack

Use the worktree-aware Docker teardown command instead of plain `docker compose down`:

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

`worktree:env` prints the full derived environment for the worktree, including `DATABASE_URL`, `REDIS_URL`, `AWS_ENDPOINT_URL`, and the derived worktree ports.

## Important rule

For the main repo checkout, plain Docker commands are still fine:

```bash
docker compose -f docker/compose/dev.yml up -d
```

For a worktree checkout, use:

```bash
bun run worktree:setup
```

Otherwise the worktree runtime will not be provisioned correctly and you can still get port collisions.

## Run the CLI in a worktree

When you run the root CLI script from inside a worktree, the generated root `.env` makes the normal CLI path point at the worktree app URL and local database without manual exports or a wrapper.

Example:

```bash
bun run worktree:setup
bun run cli chat --message "hi" --model openai/gpt-5.4-mini
```
