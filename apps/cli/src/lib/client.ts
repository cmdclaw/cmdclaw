import {
  DEFAULT_SERVER_URL,
  createRpcClient,
  defaultProfileStore,
  type BapApiClient,
  type BapProfile,
} from "@bap/client";

export function resolveServerUrl(serverUrl?: string): string {
  return serverUrl || process.env.APP_SERVER_URL || DEFAULT_SERVER_URL;
}

function loadStoredProfile(serverUrl?: string): BapProfile | null {
  return defaultProfileStore.load(resolveServerUrl(serverUrl));
}

function createAuthenticatedClient(params?: {
  serverUrl?: string;
  token?: string;
}): { serverUrl: string; profile: BapProfile; client: BapApiClient } {
  const serverUrl = resolveServerUrl(params?.serverUrl);
  const profile =
    params?.token !== undefined
      ? { serverUrl, token: params.token }
      : defaultProfileStore.load(serverUrl);

  if (!profile?.token) {
    throw new Error(
      `Not authenticated for ${serverUrl}. Run 'bun run bap -- auth login --server ${serverUrl}' first.`,
    );
  }

  return {
    serverUrl,
    profile,
    client: createRpcClient(serverUrl, profile.token),
  };
}
