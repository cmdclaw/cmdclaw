import type { RuntimeHarness } from "./base";

export class AgentSdkHarness implements RuntimeHarness {
  readonly id = "agent-sdk" as const;
}
