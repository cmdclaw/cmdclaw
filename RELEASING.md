# Releasing

CmdClaw now uses one long-lived branch:

- `main` is the only working branch.
- Railway's GitHub integration should keep deploying `main` to `staging`.
- `production` is deployed only from release tags.

## Tag format

Production tags use a date-based format:

- first release of the day: `v2026.3.23`
- later release that same day: `v2026.3.23-2`, `v2026.3.23-3`

Accepted tags match:

```text
^v\d{4}\.\d{1,2}\.\d{1,2}(-\d+)?$
```

## Cut a production release

Tag a commit that is already on `main`, then push the tag:

```bash
git checkout main
git pull --ff-only origin main
git tag v2026.4.8
git push origin v2026.4.8
```

The `Production Release` GitHub Actions workflow will:

- validate the tag format
- verify the tagged commit is on `main`
- deploy the tagged commit to Railway `production`
- deploy both the web and worker services from the same tag

## Same-day follow-up release

If you need another production release on the same day, use a numeric dash suffix:

```bash
git tag v2026.4.8-2
git push origin v2026.4.8-2
```

## Re-run or roll back a release

Use GitHub Actions `workflow_dispatch` on the `Production Release` workflow and provide an existing release tag.

Examples:

- re-run current release: `v2026.4.8`
- roll back to an older release: `v2026.4.6`

## Required GitHub secrets

Set these repository secrets for the production release workflow:

- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_PRODUCTION_ENVIRONMENT`
- `RAILWAY_WEB_SERVICE`
- `RAILWAY_WORKER_SERVICE`

Values may be Railway IDs or names where Railway accepts either.

## Required Railway setup

In Railway:

- keep `staging` GitHub autodeploy enabled on `main`
- disable `production` GitHub autodeploy so production only moves from tags

The release workflow copies `apps/web/railway.web.toml` or `apps/worker/railway.worker.toml`
into a temporary root `railway.toml` before each deploy, so both services deploy from the tagged
commit using the repo's tracked Railway config.
