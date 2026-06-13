import type { SandboxProviderId } from "@bap/core/server/sandbox/core/types";

export interface SandboxProvider {
  readonly id: SandboxProviderId;
}
