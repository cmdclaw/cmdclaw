# Daytona OSS Self-Hosted Experiment

This experiment vendors Daytona's documented OSS Docker Compose stack and adds a smoke test that creates two sandboxes against the local deployment.

## Start Daytona OSS

From the repo root:

```bash
docker compose -f experiments/daytona/docker-compose.yaml up -d
```

The experiment only exposes the host ports needed for local use:

- `3300` for the Daytona dashboard/API
- `4000` for the Daytona proxy
- `2222` for the SSH gateway
- `5556` for Dex login

Support services such as MinIO, Jaeger, MailDev, PgAdmin, the registry UI, the internal registry, and the runner stay on the internal Docker network only, which avoids unnecessary host-port collisions.

Access the local dashboard at [http://localhost:3300](http://localhost:3300).

Sign in with:

- Email: `dev@daytona.io`
- Password: `password`

## Create Local API Credentials

Create an API key from the local Daytona dashboard, then create `experiments/daytona/.env` from the example file:

```bash
cp experiments/daytona/.env.example experiments/daytona/.env
```

Set:

- `DAYTONA_API_KEY` to the API key you created locally
- `DAYTONA_API_URL` to `http://localhost:3300/api` unless your local API is exposed elsewhere
- `DAYTONA_TARGET` to `us` unless you changed the default runner region in the compose stack

The smoke script reads `experiments/daytona/.env` directly so it stays isolated from `apps/web/.env`.

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
- deletes both sandboxes before exiting

## Validate The Compose File

```bash
docker compose -f experiments/daytona/docker-compose.yaml config
```

## Optional Proxy DNS Setup

Preview and proxy URLs are not required for the smoke test. If you want Daytona's `*.proxy.localhost` hostnames to resolve locally, use Daytona's official helper:

```bash
curl -fsSL https://raw.githubusercontent.com/daytonaio/daytona/main/scripts/setup-proxy-dns.sh | bash
```
