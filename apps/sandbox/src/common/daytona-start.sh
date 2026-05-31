#!/bin/bash
set -euo pipefail

OPENCODE_PORT=4096
SANDBOX_AGENT_PORT=2468

cd /app
mkdir -p /app/.cmdclaw
export OPENCODE_CONFIG=/app/opencode.json

opencode serve --hostname 0.0.0.0 --port "${OPENCODE_PORT}" >/tmp/opencode.log 2>&1 &
opencode_pid=$!

sandbox-agent server --no-token --host 0.0.0.0 --port "${SANDBOX_AGENT_PORT}" >/tmp/sandbox-agent.log 2>&1 &
sandbox_agent_pid=$!

cleanup() {
  kill "${opencode_pid}" "${sandbox_agent_pid}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

wait -n "${opencode_pid}" "${sandbox_agent_pid}"
status=$?
cleanup
wait "${opencode_pid}" "${sandbox_agent_pid}" 2>/dev/null || true
exit "${status}"
