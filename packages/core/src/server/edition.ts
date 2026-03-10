import { env } from "../env";
import { getEditionCapabilities } from "../lib/edition";

export const edition = env.CMDCLAW_EDITION;
export const editionCapabilities = getEditionCapabilities(edition);

export function isSelfHostedEdition(): boolean {
  return edition === "selfhost";
}

export function isCloudEdition(): boolean {
  return edition === "cloud";
}
