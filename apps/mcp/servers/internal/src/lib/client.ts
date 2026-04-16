import { createRpcClient, defaultProfileStore, DEFAULT_SERVER_URL } from "@cmdclaw/client";

export function resolveServerUrl(serverUrl?: string): string {
  return serverUrl || process.env.CMDCLAW_SERVER_URL || DEFAULT_SERVER_URL;
}

export function createMcpClient(serverUrl?: string) {
  const resolvedServerUrl = resolveServerUrl(serverUrl);
  const profile = defaultProfileStore.load(resolvedServerUrl);
  if (!profile?.token) {
    return {
      status: "needs_auth" as const,
      serverUrl: resolvedServerUrl,
      message: `Run 'bun run cmdclaw -- auth login --server ${resolvedServerUrl}' first.`,
    };
  }

  return {
    status: "ready" as const,
    serverUrl: resolvedServerUrl,
    client: createRpcClient(resolvedServerUrl, profile.token),
  };
}
