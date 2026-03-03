import type { RuntimeSelection } from "@/server/sandbox/core/types";
import { env } from "@/env";

export function resolveRuntimeSelection(): RuntimeSelection {
  const sandboxProvider = env.SANDBOX_DEFAULT;
  const runtimeHarness = env.SANDBOX_AGENT_RUNTIME === "agentsdk" ? "agent-sdk" : "opencode";

  return {
    sandboxProvider,
    runtimeHarness,
    runtimeProtocolVersion: runtimeHarness === "agent-sdk" ? "sandbox-agent-v1" : "opencode-v2",
  };
}
