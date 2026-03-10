export type CmdclawEdition = "cloud" | "selfhost";

export type EditionCapabilities = {
  edition: CmdclawEdition;
  hasBilling: boolean;
  hasSupportAdmin: boolean;
  hasInstanceAdmin: boolean;
  integrationConnectMode: "local" | "cloud_redirect";
  sandboxProviders: Array<"e2b" | "daytona" | "docker">;
  requiresCloudControlPlane: boolean;
};

const CLOUD_CAPABILITIES: EditionCapabilities = {
  edition: "cloud",
  hasBilling: true,
  hasSupportAdmin: true,
  hasInstanceAdmin: false,
  integrationConnectMode: "local",
  sandboxProviders: ["e2b", "daytona", "docker"],
  requiresCloudControlPlane: false,
};

const SELFHOST_CAPABILITIES: EditionCapabilities = {
  edition: "selfhost",
  hasBilling: false,
  hasSupportAdmin: false,
  hasInstanceAdmin: true,
  integrationConnectMode: "cloud_redirect",
  sandboxProviders: ["e2b"],
  requiresCloudControlPlane: true,
};

export function getEditionCapabilities(edition: CmdclawEdition): EditionCapabilities {
  return edition === "selfhost" ? SELFHOST_CAPABILITIES : CLOUD_CAPABILITIES;
}
