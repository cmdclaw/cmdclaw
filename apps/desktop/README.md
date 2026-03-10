# CmdClaw Desktop (Electron)

This package wraps the web app in `/Users/baptiste/Git/cmdclaw/apps/web` as an Electron desktop app.

## Commands

- `bun run dev`: start Next.js dev server and Electron together.
- `bun run build`: build `apps/web` and prepare the standalone desktop bundle.
- `bun run start`: run Electron against prepared production bundle.
- `bun run dist:mac`: create macOS installers (`dmg`, `zip`) in `apps/desktop/dist`.

## Notes

- Web app source code is not duplicated.
- Desktop package only contains Electron shell + packaging config.
- Uses Next.js standalone output from `apps/web/.next/standalone`.
