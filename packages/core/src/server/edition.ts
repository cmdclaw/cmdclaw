import { getEditionCapabilities, type BapEdition } from "../lib/edition";

function resolveEdition(): BapEdition {
  return process.env.BAP_EDITION === "selfhost" ? "selfhost" : "cloud";
}

export const edition = resolveEdition();
export const editionCapabilities = getEditionCapabilities(edition);

export function isSelfHostedEdition(): boolean {
  return edition === "selfhost";
}

export function isCloudEdition(): boolean {
  return edition === "cloud";
}
