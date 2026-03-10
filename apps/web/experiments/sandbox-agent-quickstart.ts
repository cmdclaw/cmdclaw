import { SandboxAgent } from "sandbox-agent";

const baseUrl = process.env.SANDBOX_AGENT_BASE_URL ?? "http://127.0.0.1:2468";
const token = process.env.SANDBOX_AGENT_TOKEN;
const startLocal = process.env.SANDBOX_AGENT_START === "1";

function pickAgentId(ids: string[]): string {
  if (process.env.SANDBOX_AGENT_ID) {
    return process.env.SANDBOX_AGENT_ID;
  }
  const preferred = ["opencode", "codex", "claude", "amp", "mock"];
  for (const candidate of preferred) {
    if (ids.includes(candidate)) {
      return candidate;
    }
  }
  return ids[0] ?? "mock";
}

const sdk = startLocal
  ? await SandboxAgent.start()
  : await SandboxAgent.connect({
      baseUrl,
      ...(token ? { token } : {}),
    });

try {
  const health = await sdk.getHealth();
  console.log("health:", health.status);

  const agents = await sdk.listAgents({ config: true });
  const installed = agents.agents.filter((agent) => agent.installed).map((agent) => agent.id);
  console.log("installed agents:", installed.join(", "));

  if (installed.length === 0) {
    throw new Error("No installed agents found.");
  }

  const agentId = pickAgentId(installed);
  console.log("selected agent:", agentId);

  const session = await sdk.createSession({
    id: `quickstart-${crypto.randomUUID()}`,
    agent: agentId,
    sessionInit: {
      cwd: "/app",
      mcpServers: [],
    },
  });

  const result = await session.prompt([
    { type: "text", text: "Reply with exactly: sandbox-agent quickstart ok" },
  ]);

  console.log("session:", {
    localId: session.id,
    agentSessionId: session.agentSessionId,
  });
  console.log("prompt stopReason:", result.stopReason);
} finally {
  await sdk.dispose();
}
