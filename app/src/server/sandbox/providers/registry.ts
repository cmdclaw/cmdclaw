import type { SandboxProviderId } from "@/server/sandbox/core/types";
import type { SandboxProvider } from "./base";
import { BYOCProvider } from "./byoc";
import { DaytonaProvider } from "./daytona";
import { E2BProvider } from "./e2b";

const registry: Record<SandboxProviderId, () => SandboxProvider> = {
  e2b: () => new E2BProvider(),
  daytona: () => new DaytonaProvider(),
  byoc: () => new BYOCProvider(),
};

export function getSandboxProvider(providerId: SandboxProviderId): SandboxProvider {
  return registry[providerId]();
}
