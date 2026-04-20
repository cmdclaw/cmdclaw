# Daytona OSS Self-Hosted Stack

This stack vendors Daytona's documented OSS Docker Compose setup inside the shared development compose file and adds a smoke test that creates two sandboxes against the local deployment.

## Start Daytona OSS

From the repo root:

```bash
docker compose --env-file .env -f docker/compose/dev.yml --profile daytona up -d
```

The shared stack exposes the host ports needed for local use:

- `3300` for the Daytona dashboard/API
- `4000` for the Daytona proxy
- `2222` for the SSH gateway
- `5556` for Dex login

Daytona reuses the shared local MinIO and Jaeger services from `docker/compose/dev.yml`. MailDev, PgAdmin, the registry UI, the internal registry, and the runner stay internal to the Docker network.

Access the local dashboard at [http://localhost:3300](http://localhost:3300).

Sign in with:

- Email: `dev@daytona.io`
- Password: `password`

## Create Local API Credentials

Create an API key from the local Daytona dashboard, then add these values to the repo-root `/.env`:

- `DAYTONA_API_KEY` to the API key you created locally
- `DAYTONA_API_URL` to `http://localhost:3300/api` unless your local API is exposed elsewhere
- `DAYTONA_TARGET` to `eu` unless you changed the default runner region in the compose stack

## Run The Smoke Test

```bash
bun --cwd apps/sandbox run daytona:selfhost:smoke
```

The smoke test:

- creates exactly two sandboxes against the local Daytona instance
- uses the compose stack's default snapshot instead of a CmdClaw snapshot override
- runs a shell-script execution check in one sandbox
- verifies outbound internet access from a sandbox with `curl`
- writes and reads a file in the other sandbox
- prints sandbox ids and a compact pass/fail summary
- pauses for inspection and waits for `y` before deleting both sandboxes when run in a TTY
- auto-cleans sandboxes immediately when run without a TTY

## Validate The Compose File

```bash
docker compose --env-file .env -f docker/compose/dev.yml --profile daytona config
```

## Optional Proxy DNS Setup

Preview and proxy URLs are not required for the smoke test. If you want Daytona's `*.proxy.localhost` hostnames to resolve locally, use Daytona's official helper:

```bash
curl -fsSL https://raw.githubusercontent.com/daytonaio/daytona/main/scripts/setup-proxy-dns.sh | bash
```
