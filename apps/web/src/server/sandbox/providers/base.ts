import type { SandboxProviderId } from "@cmdclaw/core/server/sandbox/core/types";

export interface SandboxProvider {
  readonly id: SandboxProviderId;
}
