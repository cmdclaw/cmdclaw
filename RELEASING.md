# Releasing

CmdClaw now uses one long-lived branch:

- `main` is the only working branch.
- Render should keep deploying `main` to `staging`.
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
- run the production prerelease workflows
- create the release tag used for production deployment

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

Set the repository secrets required by the production prerelease workflows.
Deployment configuration is tracked in `render.yaml`, and service secrets should
come from the Render environment groups described there.

## Required Render setup

In Render:

- keep staging deployment wired to `main`
- keep production deployment controlled by release tags
- use the services defined in `render.yaml`, including `cmdclaw-web-prod` and
  `cmdclaw-worker-prod`
