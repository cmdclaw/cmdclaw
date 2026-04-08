<p align="center">
  <img src="apps/web/public/logo.png" alt="CmdClaw" width="80" />
</p>

<h1 align="center">CmdClaw</h1>

<p align="center">
  Your voice coworker — an open-source AI assistant that connects to the tools you use every day.
</p>

<p align="center">
  <a href="https://docs.cmdclaw.ai"><img src="https://img.shields.io/badge/docs-cmdclaw.ai-blue" alt="Documentation" /></a>
  <a href="https://discord.com/invite/NHQy8gXerd"><img src="https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="https://cmdclaw.ai">Website</a> &middot;
  <a href="https://app.cmdclaw.ai">App</a> &middot;
  <a href="https://docs.cmdclaw.ai">Docs</a> &middot;
  <a href="https://discord.com/invite/NHQy8gXerd">Discord</a>
</p>

---

CmdClaw is an open-source, multi-platform AI assistant that lets you interact with your favorite services through conversation. Connect your tools, talk to CmdClaw, and let it handle the rest — from sending emails and scheduling meetings to managing issues and updating your CRM.

## Features

- **Conversational AI** — Powered by Claude, with streaming responses and multi-turn context
- **13+ Integrations** — Gmail, Google Calendar, Google Docs, Google Sheets, Google Drive, Notion, Linear, GitHub, Airtable, Slack, HubSpot, Salesforce, LinkedIn
- **Voice Input** — Native speech-to-text on macOS and iOS via Whisper
- **Custom Skills** — Create and manage reusable skills with a built-in editor
- **Approval Workflow** — Review and approve sensitive actions before they execute
- **Code Execution** — Sandboxed code running via E2B, Daytona, or Docker
- **Cross-Platform** — Web (Next.js), macOS (SwiftUI), iOS (SwiftUI)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web | Next.js 16, React 19, Tailwind CSS 4 |
| API | ORPC, Better Auth |
| Database | PostgreSQL, Drizzle ORM |
| AI | Anthropic Claude, OpenAI, Google Gemini |
| Queue | BullMQ, Redis |
| Storage | S3 / MinIO |
| Sandbox | E2B, Daytona, Docker |
| Native | SwiftUI (macOS & iOS) |

## Project Structure

```text
cmdclaw/
├── apps/
│   ├── web/      # Next.js web app
│   ├── desktop/  # Electron wrapper
│   ├── worker/   # BullMQ worker runtime
│   └── ws/       # WebSocket runtime
├── packages/
│   ├── config/   # Shared tooling config
│   ├── core/     # Shared runtime logic
│   └── db/       # Drizzle schema and DB client
├── apple/        # macOS and iOS SwiftUI applications
├── docs/         # Documentation site (Mintlify)
└── infra/        # Infrastructure as code
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (recommended)
- PostgreSQL
- Redis

### Setup

```bash
# Clone the repo
git clone https://github.com/your-username/cmdclaw.git
cd cmdclaw

# Install dependencies
bun install

# Start local services (Postgres, Redis, MinIO)
docker compose -f apps/web/docker-compose.yml up -d

# Configure environment variables
cp apps/web/.env.selfhost.example apps/web/.env

# Push the database schema
bun db:push

# Seed the database (optional)
bun db:seed

# Start the web app, worker, and WS runtime
bun dev
```

The web app will be available at `http://localhost:3000`.

### Useful Commands

```bash
bun dev             # Start web + worker + ws
bun dev:web         # Start only the web app
bun dev:desktop     # Start the Electron wrapper
bun dev:docs        # Start the docs site
bun build           # Production build for all workspaces
bun db:studio       # Open Drizzle Studio
bun db:push         # Push schema changes
bun start:worker    # Start the background job worker (loads apps/web/.env)
bun start:ws        # Start the WebSocket server (loads apps/web/.env)
bun check           # Run workspace checks
bun test            # Run workspace tests
```

Chat and coworker generations are executed by the BullMQ worker. `bun dev:web` is not enough for
end-to-end local runs; use `bun dev` or start `bun start:worker` alongside the web app.

## Releases

Releases now use `main` plus date-based production tags. See [RELEASING.md](RELEASING.md) for the
tag format, required Railway/GitHub setup, and the production release flow.

## Native Apps

The `apple/` directory contains SwiftUI applications for macOS and iOS. Open `apple/cmdclaw.xcodeproj` in Xcode to build and run.

Features specific to native apps:
- Voice input with Whisper transcription
- macOS overlay chat interface
- Native networking layer

## Contributing

CmdClaw is open source and contributions are welcome. Feel free to open issues, submit pull requests, or suggest new integrations.

## License

Open source. See [LICENSE](LICENSE) for details.
