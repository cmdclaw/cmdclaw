import { getEditionCapabilities } from "@cmdclaw/core/lib/edition";
import { env } from "@/env";

export const clientEdition = env.NEXT_PUBLIC_CMDCLAW_EDITION ?? "cloud";
export const clientEditionCapabilities = getEditionCapabilities(clientEdition);

export function isSelfHostedClientEdition(): boolean {
  return clientEdition === "selfhost";
}
