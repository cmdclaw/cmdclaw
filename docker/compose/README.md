# Local Docker

```bash
docker compose --env-file .env -f docker/compose/dev.yml up -d
```

For a worktree-local stack, export the worktree overrides first so Compose gets a
unique project name, ports, and volumes for that checkout:

```bash
eval "$(bun run worktree env)"
docker compose -f docker/compose/dev.yml up -d
```
