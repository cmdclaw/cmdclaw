---
name: sync-skills-with-hermes
description: Synchronize this repository's agent skills into ~/.hermes/skills as symlinks. Use when the user wants to sync, resync, install, or periodically refresh Bap repo skills for Hermes.
---

# Sync Skills With Hermes

Use the bundled script to symlink repo-local skills into Hermes:

```sh
.agents/skills/sync-skills-with-hermes/scripts/sync.sh
```

Run from anywhere. By default it syncs:

- source: this repo's `.agents/skills`
- target: `~/.hermes/skills`

The script is conservative:

- creates the target directory if needed
- links direct child skill directories
- skips target names that already exist
- skips broken source symlinks
- never deletes or overwrites existing Hermes skills

For a dry run:

```sh
.agents/skills/sync-skills-with-hermes/scripts/sync.sh --dry-run
```

Override paths when needed:

```sh
.agents/skills/sync-skills-with-hermes/scripts/sync.sh /path/to/.agents/skills ~/.hermes/skills
```
