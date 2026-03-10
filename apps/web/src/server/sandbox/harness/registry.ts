import type { RuntimeHarnessId } from "@cmdclaw/core/server/sandbox/core/types";
import type { RuntimeHarness } from "./base";
import { AgentSdkHarness } from "./agent-sdk";
import { OpencodeHarness } from "./opencode";

const registry: Record<RuntimeHarnessId, () => RuntimeHarness> = {
  opencode: () => new OpencodeHarness(),
  "agent-sdk": () => new AgentSdkHarness(),
};

export function getRuntimeHarness(harnessId: RuntimeHarnessId): RuntimeHarness {
  return registry[harnessId]();
}
