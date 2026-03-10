# Sandbox Agent Experiments

These scripts validate the Sandbox Agent docs flows with your app setup.

## Quickstart (`npm i -g` flow)

Start server separately (global CLI path from docs), then run:

```bash
bun run experiment:sandbox-agent:quickstart
```

Optional self-managed server:

```bash
SANDBOX_AGENT_START=1 bun run experiment:sandbox-agent:quickstart
```

## SDK Overview flow

```bash
bun run experiment:sandbox-agent:sdk-overview
```

Optional self-managed server:

```bash
SANDBOX_AGENT_START=1 bun run experiment:sandbox-agent:sdk-overview
```

## Skills Config flow

```bash
bun run experiment:sandbox-agent:skills-config
```

Useful env vars:

- `SANDBOX_AGENT_BASE_URL` (default `http://127.0.0.1:2468`)
- `SANDBOX_AGENT_TOKEN`
- `SANDBOX_AGENT_ID` (agent id for session create)
- `SKILLS_DIRECTORY` (default `/app`)
- `SKILLS_NAME` (default `opencode`)
- `SKILLS_CLEANUP=1` (delete test config after validation)
