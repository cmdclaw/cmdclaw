import type { SandboxProviderId } from "@/server/sandbox/core/types";

export interface SandboxProvider {
  readonly id: SandboxProviderId;
}
