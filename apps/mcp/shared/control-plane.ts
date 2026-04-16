import { resolveCmdclawAppUrl, requireServerSecret } from "./runtime";

export async function getManagedIntegrationTokens(params: {
  userId: string;
  workspaceId?: string;
  integrationTypes: string[];
}): Promise<Record<string, string>> {
  const response = await fetch(
    new URL("/api/internal/mcp/runtime-credentials", resolveCmdclawAppUrl()),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireServerSecret()}`,
      },
      body: JSON.stringify(params),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to fetch runtime credentials (${response.status})`);
  }

  const payload = (await response.json()) as { tokens?: Record<string, string> };
  return payload.tokens ?? {};
}
