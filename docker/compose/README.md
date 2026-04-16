# Self-Hosting CmdClaw with Docker Compose

Run these commands from the repo root.

This setup is the recommended first self-hosted deployment shape for CmdClaw:

- `app` for the Next.js UI and API
- `worker` for BullMQ generation execution and background jobs
- `database` for PostgreSQL
- `redis` for queues and transient coordination
- `minio` for S3-compatible object storage

It is meant for internal deployments behind your own domain or reverse proxy.

## Quick Start

1. Copy the example environment file:

```bash
cp .env.selfhost.example .env.selfhost
```

2. Fill in at least these values in `.env.selfhost`:

- `APP_URL`
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`
- `CMDCLAW_SERVER_SECRET`
- `CMDCLAW_CLOUD_API_BASE_URL`
- `CMDCLAW_CLOUD_INSTANCE_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

3. Optionally pin the published GHCR images in `.env.selfhost`:

```env
CMDCLAW_APP_IMAGE=ghcr.io/baptistecolle/cmdclaw-web:main
CMDCLAW_WORKER_IMAGE=ghcr.io/baptistecolle/cmdclaw-worker:main
```

If you omit them, the compose file uses those same tags by default.

4. Pull the published images:

```bash
docker compose -f docker/compose/selfhost.yml --env-file .env.selfhost pull
```

5. Apply the database schema:

```bash
docker compose -f docker/compose/selfhost.yml --env-file .env.selfhost run --rm migrate
```

6. Start the stack:

```bash
docker compose -f docker/compose/selfhost.yml --env-file .env.selfhost up -d
```

7. Open:

```text
http://localhost:8114
```

The app health endpoint is:

```text
/api/health
```

## Internal Domain

For an internal company deployment, set both:

```env
APP_URL=https://cmdclaw.company.internal
```

Then place your usual reverse proxy in front of port `8114`.

## Authentication

Self-hosted login is delegated to CmdClaw Cloud.

You must configure:

```env
CMDCLAW_CLOUD_API_BASE_URL=https://app.cmdclaw.ai
CMDCLAW_CLOUD_INSTANCE_API_KEY=replace-with-shared-instance-api-key
```

Use the same `CMDCLAW_CLOUD_INSTANCE_API_KEY` on:

- the cloud deployment that exposes `/api/control-plane/*`
- each self-hosted deployment that should trust that cloud control plane

Users authenticate on CmdClaw Cloud with the existing cloud login methods, then the
self-hosted instance creates its own local session after the control-plane exchange.

## Email

`RESEND_*` and `EMAIL_FROM` are optional for the self-hosted app itself.

They are no longer required for end-user login when cloud-managed authentication is enabled.

Check logs with:

```bash
docker compose -f docker/compose/selfhost.yml --env-file .env.selfhost logs -f app
```

## Sandboxing

This compose file defaults to:

```env
SANDBOX_DEFAULT=docker
```

That is the easiest self-hosted mode, but it requires Docker daemon access inside `app` and `worker` through `/var/run/docker.sock`.

If you do not want local Docker sandbox execution:

- remove the Docker socket mounts
- switch `SANDBOX_DEFAULT` to another supported provider
- configure the matching provider credentials

## Notes

- `migrate` is a one-shot service used for `bun run db:push`
- the default published images are built by `.github/workflows/ghcr-images.yml` on pushes to `main`
- published images also get a daily `YYYYMMDD-N` tag such as `20260310-1`
- use a `sha-...` image tag if you want to pin a specific published build for testing
- browser-side PostHog config is baked into the published `app` image at build time; build `docker/images/web/Dockerfile` yourself if you need custom `NEXT_PUBLIC_POSTHOG_*` values
- `database`, `redis`, and `minio` are not published externally by default
- MinIO stores uploaded files and generated artifacts
- `worker` is required in production; chat and coworker generations execute there, so the web app alone is not enough
