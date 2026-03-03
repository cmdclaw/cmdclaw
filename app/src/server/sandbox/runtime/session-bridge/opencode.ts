import type {
  SandboxRuntimeAdapterOptions,
  SandboxSessionBridge,
  SandboxSessionBridgeImplementation,
} from "../types";
import { createSandboxOpencodeClient } from "../runtime-client/opencode";

function createOpencodeSessionBridge(
  client: ReturnType<typeof createSandboxOpencodeClient>,
): SandboxSessionBridge {
  return {
    hasSession: async (sessionId) => {
      const result = await client.session.get({ sessionID: sessionId });
      return !result.error && !!result.data;
    },
    createSession: async ({ title }) => {
      const created = await client.session.create({
        title: title || "Conversation",
      });
      if (created.error || !created.data) {
        const details = created.error ? JSON.stringify(created.error) : "missing_data";
        throw new Error(`Failed to create OpenCode session: ${details}`);
      }
      return created.data.id;
    },
  };
}

export const opencodeSessionBridgeImplementation: SandboxSessionBridgeImplementation = {
  createSessionBridge: async (options: SandboxRuntimeAdapterOptions) => {
    const client = createSandboxOpencodeClient({
      baseUrl: options.opencodeBaseUrl,
      fetch: options.fetch,
    });
    return createOpencodeSessionBridge(client);
  },
};
