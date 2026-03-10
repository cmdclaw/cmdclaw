# Self-Hosting CmdClaw with Docker Compose

This setup is the recommended first self-hosted deployment shape for CmdClaw:

- `app` for the Next.js UI and API
- `worker` for BullMQ background jobs
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
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

3. Apply the database schema:

```bash
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost run --rm migrate
```

4. Start the stack:

```bash
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up --build -d
```

5. Open:

```text
http://localhost:3000
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

Then place your usual reverse proxy in front of port `3000`.

## Email

`RESEND_*` and `EMAIL_FROM` are optional in this self-hosted setup.

If they are not set:

- magic links are logged to the `app` container logs instead of being emailed
- inbound email forwarding features stay unavailable

Check logs with:

```bash
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost logs -f app
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
- `database`, `redis`, and `minio` are not published externally by default
- MinIO stores uploaded files and generated artifacts
- `worker` is required in production; the web app alone is not enough
