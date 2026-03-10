import { SandboxAgent } from "sandbox-agent";

async function listSandboxAgentCandidates(client: SandboxAgent): Promise<string[]> {
  const listed = await client.listAgents();
  const preferred = ["claude"] as const;
  const selected: string[] = [];

  for (const candidate of preferred) {
    if (listed.agents.some((agent) => agent.id === candidate && agent.installed)) {
      selected.push(candidate);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- ordered install attempts
      await client.installAgent(candidate);
      // eslint-disable-next-line no-await-in-loop -- refresh list after install attempt
      const refreshed = await client.listAgents();
      if (refreshed.agents.some((agent) => agent.id === candidate && agent.installed)) {
        selected.push(candidate);
      }
    } catch (error) {
      console.warn(`[SandboxRuntime] Failed to install ${candidate} agent: ${String(error)}`);
    }
  }

  if (selected.length > 0) {
    return selected;
  }

  throw new Error("sandbox-agent requires at least one installed agent: claude or opencode.");
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
