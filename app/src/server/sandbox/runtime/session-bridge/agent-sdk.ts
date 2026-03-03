import { SandboxAgent } from "sandbox-agent";
import type { SandboxRuntimeAdapterOptions, SandboxSessionBridgeImplementation } from "../types";
import { createSandboxAgentSessionWithFallback } from "../agent-sdk/session-helpers";
import { createSandboxOpencodeClient } from "../runtime-client/opencode";

export const sandboxAgentSessionBridgeImplementation: SandboxSessionBridgeImplementation = {
  createSessionBridge: async (options: SandboxRuntimeAdapterOptions) => {
    const sandboxAgent = await SandboxAgent.connect({
      baseUrl: options.serverUrl,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    const opencodeClient = createSandboxOpencodeClient({
      baseUrl: options.opencodeBaseUrl,
      fetch: options.fetch,
    });

    return {
      hasSession: async (sessionId) => {
        const existing = await sandboxAgent.getSession(sessionId);
        if (existing) {
          return true;
        }
        const viaOpencode = await opencodeClient.session.get({ sessionID: sessionId });
        return !viaOpencode.error && !!viaOpencode.data;
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
        const candidateIds = [created.id, created.agentSessionId].filter(
          (value, index, all): value is string =>
            typeof value === "string" && all.indexOf(value) === index,
        );

        for (const candidateId of candidateIds) {
          try {
            // eslint-disable-next-line no-await-in-loop -- probe session id compatibility in priority order
            const lookup = await opencodeClient.session.get({ sessionID: candidateId });
            if (!lookup.error && lookup.data) {
              return candidateId;
            }
          } catch {
            // Try next candidate.
          }
        }

        return created.id;
      },
    };
  },
};
