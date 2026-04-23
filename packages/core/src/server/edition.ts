import { getEditionCapabilities, type CmdclawEdition } from "../lib/edition";

function resolveEdition(): CmdclawEdition {
  return process.env.CMDCLAW_EDITION === "selfhost" ? "selfhost" : "cloud";
}

export const edition = resolveEdition();
export const editionCapabilities = getEditionCapabilities(edition);

export function isSelfHostedEdition(): boolean {
  return edition === "selfhost";
}

export function isCloudEdition(): boolean {
  return edition === "cloud";
}
