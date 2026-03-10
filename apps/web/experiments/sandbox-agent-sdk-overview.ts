import { SandboxAgent } from "sandbox-agent";

const baseUrl = process.env.SANDBOX_AGENT_BASE_URL ?? "http://127.0.0.1:2468";
const token = process.env.SANDBOX_AGENT_TOKEN;
const agent = process.env.SANDBOX_AGENT_ID ?? "opencode";
const startLocal = process.env.SANDBOX_AGENT_START === "1";

const sdk = startLocal
  ? await SandboxAgent.start()
  : await SandboxAgent.connect({
      baseUrl,
      ...(token ? { token } : {}),
    });

try {
  const session = await sdk.createSession({
    id: `sdk-overview-${crypto.randomUUID()}`,
    agent,
    sessionInit: {
      cwd: "/app",
      mcpServers: [],
    },
  });

  const liveEvents: string[] = [];
  const off = session.onEvent((event) => {
    const method = (event.payload as { method?: string } | undefined)?.method ?? "unknown";
    liveEvents.push(method);
  });

  const result = await session.prompt([
    {
      type: "text",
      text: "List 3 short bullets describing what files are in the current working directory.",
    },
  ]);

  off();

  const page = await sdk.getEvents({
    sessionId: session.id,
    limit: 50,
  });

  console.log("session:", {
    localId: session.id,
    agentSessionId: session.agentSessionId,
  });
  console.log("stopReason:", result.stopReason);
  console.log("live events captured:", liveEvents.length);
  console.log("persisted events fetched:", page.items.length);
  console.log("nextCursor:", page.nextCursor ?? null);
} finally {
  await sdk.dispose();
}
