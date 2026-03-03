import * as dotenvConfig from "dotenv/config";
import { Sandbox } from "e2b";
import { SandboxAgent } from "sandbox-agent";

void dotenvConfig;

const TEMPLATE_NAME = process.env.E2B_DAYTONA_SANDBOX_NAME || "cmdclaw-agent-dev";
const PORT = Number(process.env.SANDBOX_AGENT_PORT || "4096");
const agent = process.env.SANDBOX_AGENT_ID || "opencode";
const promptText =
  process.env.SANDBOX_AGENT_PROMPT ||
  "Use bash to run `ls -la /app` and then briefly summarize what you found.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      // eslint-disable-next-line no-await-in-loop -- readiness polling is intentional
      const res = await fetch(`${baseUrl}/v1/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
  throw new Error(`sandbox-agent server not ready at ${baseUrl}`);
}

async function main() {
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY is required");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  const sandbox = await Sandbox.create(TEMPLATE_NAME, {
    timeoutMs: 15 * 60_000,
    envs: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });

  try {
    console.log("sandbox created:", sandbox.sandboxId);
    const host = sandbox.getHost(PORT);
    const baseUrl = `https://${host}`;
    console.log("baseUrl:", baseUrl);

    console.log("starting sandbox-agent server...");
    await sandbox.commands.run(
      `cd /app && sandbox-agent server --no-token --host 0.0.0.0 --port ${PORT}`,
      { timeoutMs: 0, background: true },
    );
    console.log("waiting for server health...");
    await waitForServer(baseUrl);

    const sdk = await SandboxAgent.connect({ baseUrl });
    try {
      const listed = await sdk.listAgents({ config: true });
      console.log(
        "agents:",
        listed.agents
          .filter((x) => x.installed)
          .map((x) => x.id)
          .join(", "),
      );
      if (!listed.agents.some((x) => x.id === agent && x.installed)) {
        console.log(`installing agent: ${agent}`);
        await sdk.installAgent(agent);
      }

      const session = await sdk.createSession({
        id: `trace-${crypto.randomUUID()}`,
        agent,
        sessionInit: {
          cwd: "/app",
          mcpServers: [],
        },
      });

      console.log("session:", { id: session.id, agentSessionId: session.agentSessionId });

      const seenMethods: Record<string, number> = {};
      const seenUpdateKinds: Record<string, number> = {};
      const off = session.onEvent((event) => {
        const payload = event.payload as Record<string, unknown> | undefined;
        const method =
          payload && typeof payload.method === "string" ? payload.method : "unknown_method";
        seenMethods[method] = (seenMethods[method] || 0) + 1;

        const params =
          payload && payload.params && typeof payload.params === "object"
            ? (payload.params as Record<string, unknown>)
            : undefined;
        const update =
          params && params.update && typeof params.update === "object"
            ? (params.update as Record<string, unknown>)
            : undefined;
        const kind =
          update && typeof update.sessionUpdate === "string"
            ? update.sessionUpdate
            : "unknown_update";
        seenUpdateKinds[kind] = (seenUpdateKinds[kind] || 0) + 1;

        if (method === "session/update") {
          console.log(
            "event:",
            JSON.stringify(
              {
                method,
                eventIndex: event.eventIndex,
                update: {
                  sessionUpdate: update?.sessionUpdate,
                  title: update?.title,
                  status: update?.status,
                  toolCallId: update?.toolCallId,
                },
              },
              null,
              2,
            ),
          );
        } else {
          console.log(
            "event:raw:",
            JSON.stringify(
              {
                eventIndex: event.eventIndex,
                payload,
              },
              null,
              2,
            ).slice(0, 2000),
          );
        }
      });

      const result = await session.prompt([{ type: "text", text: promptText }]);
      off();

      console.log("stopReason:", result.stopReason);
      console.log("promptResult:", JSON.stringify(result, null, 2).slice(0, 4000));
      console.log("seenMethods:", JSON.stringify(seenMethods, null, 2));
      console.log("seenUpdateKinds:", JSON.stringify(seenUpdateKinds, null, 2));

      const events = await sdk.getEvents({ sessionId: session.id, limit: 100 });
      console.log("persisted events:", events.items.length);
      for (const evt of events.items.slice(-12)) {
        const payload = evt.payload as Record<string, unknown>;
        const method = typeof payload.method === "string" ? payload.method : "unknown_method";
        const params =
          payload.params && typeof payload.params === "object"
            ? (payload.params as Record<string, unknown>)
            : {};
        const update =
          params.update && typeof params.update === "object"
            ? (params.update as Record<string, unknown>)
            : {};
        const sessionUpdate =
          typeof update.sessionUpdate === "string" ? update.sessionUpdate : undefined;
        console.log(
          "persisted:",
          JSON.stringify(
            {
              eventIndex: evt.eventIndex,
              method,
              sessionUpdate,
              title: update.title,
              status: update.status,
              toolCallId: update.toolCallId,
            },
            null,
            2,
          ),
        );
      }
    } finally {
      await sdk.dispose();
    }
  } finally {
    await sandbox.kill();
  }
}

await main();
