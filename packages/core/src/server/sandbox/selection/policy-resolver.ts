import type { RuntimeSelection } from "../core/types";
import { resolveSandboxAgentRuntimeForModel } from "../opencode-runtime";
import { env } from "../../../env";

export function resolveRuntimeSelection(input?: {
  model?: string;
  sandboxProviderOverride?: "e2b" | "daytona" | "docker";
}): RuntimeSelection {
  const sandboxProvider = input?.sandboxProviderOverride ?? env.SANDBOX_DEFAULT;
  const runtime = input?.model ? resolveSandboxAgentRuntimeForModel(input.model) : "opencode";
  const runtimeHarness = runtime === "agentsdk" ? "agent-sdk" : "opencode";

  return {
    sandboxProvider,
    runtimeHarness,
    runtimeProtocolVersion: runtimeHarness === "agent-sdk" ? "sandbox-agent-v1" : "opencode-v2",
  };
}
