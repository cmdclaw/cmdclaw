# Worktrees

This repo has a dedicated worktree flow for running isolated app processes with a mixed Docker model:

- shared stateful services for Postgres, Redis, MinIO, Grafana, and Alertmanager
- per-worktree observability services for Vector, VictoriaMetrics, VictoriaLogs, VictoriaTraces, and vmalert

## When to use it

Use a worktree when you want to run multiple copies of CmdClaw side by side without port collisions between:

- the web app
- the worker
- the WS runtime
- local observability ports such as Jaeger and OTEL
- Daytona ports when that profile is enabled

## Main idea

Each worktree gets:

- a stable `instanceId`
- its own app and WS ports
- its own Postgres database and Postgres role on the shared Postgres server
- its own Redis ACL user and Redis key namespace on the shared Redis server
- its own MinIO bucket and MinIO credentials on the shared MinIO server
- a 2-digit stack slot used to derive worktree-only ports such as `84xx`, `94xx`, `104xx`, and `431xx`
- its own Docker Compose project name and volumes for the observability stack only

Example:

- slot `07` maps to VictoriaMetrics `8407`
- slot `07` maps to VictoriaLogs `9407`
- slot `07` maps to VictoriaTraces `10407`
- slot `07` maps to OTLP gRPC `43107`

## Start a worktree app

From inside the worktree:

```bash
bun run worktree:setup
```

This fails fast if Docker is not installed or the Docker daemon is not running. Otherwise it starts or reuses the shared stateful services, starts the worktree-scoped observability services, provisions the worktree-specific Postgres, Redis, and MinIO credentials, writes the generated `.env`, and starts the web, worker, and WS processes for that worktree.

Each worktree writes a computed `.env` file at the repo root. That file is the authoritative runtime env for worktree commands and normal repo scripts inside that worktree, including `worktree:setup`, `worktree:dev`, and `bun run cli ...`.

## Start only the Docker stack

If you only want Docker without starting the app processes:

```bash
bun run worktree:docker-up
```

This starts or reuses the shared stateful services and starts the worktree-scoped observability services for the current worktree.

## Stop the worktree Docker stack

Use the worktree-aware Docker teardown command instead of plain `docker compose down`:

```bash
bun run worktree:docker-down
```

This stops only the current worktree observability stack. It does not stop the shared Postgres, Redis, MinIO, Grafana, or Alertmanager containers.

## Inspect the assigned values

To see the current worktree assignment:

```bash
bun run worktree:status
bun run worktree:env
```

`worktree:status` shows the instance id, stack slot, app URL, database name, the worktree Docker project, the shared Docker project, and the derived local addresses for shared stateful services plus the worktree observability ports.

It also shows the exact `.env` path currently backing the worktree.

`worktree:env` prints the full derived environment for the worktree, including the worktree-scoped `DATABASE_URL`, `REDIS_URL`, `AWS_ENDPOINT_URL`, and the derived observability ports.

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

## Implementation location

The worktree lifecycle implementation lives in `apps/worktree`:

- `apps/worktree/src/cli.ts` handles the worktree lifecycle commands
- `apps/worktree/src/stack.ts` defines the shared and per-worktree port and volume assignments
- `apps/worktree/src/proxy.ts` runs the local proxy from the main checkout

## Run the CLI in a worktree

When you run the root CLI script from inside a worktree, the generated root `.env` makes the normal CLI path point at the worktree app URL and local database without manual exports or a wrapper.

Example:

```bash
bun run worktree:setup
bun run cli chat --message "hi" --model openai/gpt-5.4-mini
```
