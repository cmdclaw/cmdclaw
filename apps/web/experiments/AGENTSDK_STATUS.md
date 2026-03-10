# AgentSDK Status (2026-03-03)

## Working

- `agentsdk` runtime path is wired directly through `sandbox-agent` SDK (no OpenCode client fallback in runtime/bridge).
- Session streaming events are mapped for `agent_message_chunk`, `tool_call`, and `tool_call_update`.
- Permission requests from SDK (`session/request_permission`) are surfaced to CmdClaw approval flow.

## Still Not Working

- Permission reply completion path is still incomplete for the real Slack flow:
  - Approval appears in CLI/UI (`awaiting_approval`).
  - Submitting deny/approve does not reliably complete the ACP permission round-trip.
  - Result: generation stays `running` and eventually stream-times out.

## Repro

```bash
bun run chat --message "send a message on slack saying hi in #bap-experiemnts channel" --model anthropic/claude-sonnet-4-6
```

Observed behavior:

- transitions to `awaiting_approval`
- then returns to `running`
- then times out without clean completion
