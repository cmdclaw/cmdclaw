import type { RuntimeSelection } from "../core/types";
import { env } from "../../../env";

export function resolveRuntimeSelection(input?: {
  sandboxProviderOverride?: "e2b" | "daytona" | "docker";
}): RuntimeSelection {
  const sandboxProvider = input?.sandboxProviderOverride ?? env.SANDBOX_DEFAULT;
  const runtimeHarness = env.SANDBOX_AGENT_RUNTIME === "agentsdk" ? "agent-sdk" : "opencode";

  return {
    sandboxProvider,
    runtimeHarness,
    runtimeProtocolVersion: runtimeHarness === "agent-sdk" ? "sandbox-agent-v1" : "opencode-v2",
  };
}
