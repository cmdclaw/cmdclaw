import { SandboxAgent } from "sandbox-agent";
import type { SandboxRuntimeAdapterOptions, SandboxSessionBridgeImplementation } from "../types";
import { createSandboxAgentSessionWithFallback } from "../agent-sdk/session-helpers";

export const sandboxAgentSessionBridgeImplementation: SandboxSessionBridgeImplementation = {
  createSessionBridge: async (options: SandboxRuntimeAdapterOptions) => {
    const sandboxAgent = await SandboxAgent.connect({
      baseUrl: options.serverUrl,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });

    return {
      hasSession: async (sessionId) => {
        const existing = await sandboxAgent.getSession(sessionId);
        if (existing) {
          return true;
        }
        const listed = await sandboxAgent.listSessions({ limit: 200 });
        return listed.items.some(
          (session) => session.id === sessionId || session.agentSessionId === sessionId,
        );
      },
      createSession: async () => {
        const created = await createSandboxAgentSessionWithFallback({
          client: sandboxAgent,
          id: crypto.randomUUID(),
          sessionInit: {
            cwd: "/app",
            mcpServers: [],
          },
        });
        return created.agentSessionId || created.id;
      },
    };
  },
};
