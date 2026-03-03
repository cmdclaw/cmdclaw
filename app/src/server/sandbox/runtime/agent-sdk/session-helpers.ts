import { SandboxAgent } from "sandbox-agent";

async function listSandboxAgentCandidates(client: SandboxAgent): Promise<string[]> {
  const listed = await client.listAgents();
  const preferredAgentOrder = ["codex", "claude", "opencode", "amp", "pi", "cursor"] as const;
  let installedIds = new Set(
    listed.agents.filter((agent) => agent.installed).map((agent) => agent.id),
  );
  const selected: string[] = [];

  for (let index = 0; index < preferredAgentOrder.length; index += 1) {
    const candidate = preferredAgentOrder[index];
    if (installedIds.has(candidate)) {
      selected.push(candidate);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- installation order follows preference order
      await client.installAgent(candidate);
      // eslint-disable-next-line no-await-in-loop -- refresh installed list after install attempt
      const refreshed = await client.listAgents();
      installedIds = new Set(
        refreshed.agents.filter((agent) => agent.installed).map((agent) => agent.id),
      );
      if (installedIds.has(candidate)) {
        selected.push(candidate);
      }
    } catch {
      // Try next candidate.
    }
  }

  const fallback = listed.agents.find((agent) => agent.installed && agent.id !== "mock");
  if (fallback && !selected.includes(fallback.id)) {
    selected.push(fallback.id);
  }

  if (selected.length === 0) {
    throw new Error("sandbox-agent has no installed non-mock agent.");
  }

  return selected;
}

export async function createSandboxAgentSessionWithFallback(input: {
  client: SandboxAgent;
  id: string;
  sessionInit: NonNullable<Parameters<SandboxAgent["createSession"]>[0]["sessionInit"]>;
}): Promise<Awaited<ReturnType<SandboxAgent["createSession"]>>> {
  const candidates = await listSandboxAgentCandidates(input.client);
  let lastError: unknown;

  for (const agent of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop -- prefer deterministic fallback order
      return await input.client.createSession({
        id: input.id,
        agent,
        sessionInit: input.sessionInit,
      });
    } catch (error) {
      lastError = error;
      console.warn(
        `[SandboxRuntime] Failed to create session with agent=${agent}: ${String(error)}`,
      );
    }
  }

  throw new Error(`Failed to create sandbox-agent session: ${String(lastError)}`);
}
