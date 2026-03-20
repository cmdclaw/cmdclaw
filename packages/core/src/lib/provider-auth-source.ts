import { parseModelReference, type ModelProviderID } from "./model-reference";

export const PROVIDER_AUTH_SOURCES = ["user", "shared"] as const;

export type ProviderAuthSource = (typeof PROVIDER_AUTH_SOURCES)[number];

export function providerSupportsSharedAuth(providerID: ModelProviderID | string): boolean {
  return providerID === "openai";
}

export function normalizeProviderAuthSource(params: {
  providerID: ModelProviderID | string;
  authSource?: ProviderAuthSource | null | undefined;
}): ProviderAuthSource | null {
  if (!providerSupportsSharedAuth(params.providerID)) {
    return null;
  }

  return params.authSource === "shared" ? "shared" : "user";
}

export function normalizeModelAuthSource(params: {
  model: string;
  authSource?: ProviderAuthSource | null | undefined;
}): ProviderAuthSource | null {
  const { providerID } = parseModelReference(params.model);
  return normalizeProviderAuthSource({
    providerID,
    authSource: params.authSource,
  });
}

export function resolveDefaultProviderAuthSource(params: {
  providerID: ModelProviderID | string;
  hasUserAuth: boolean;
  hasSharedAuth: boolean;
}): ProviderAuthSource | null {
  if (!providerSupportsSharedAuth(params.providerID)) {
    return null;
  }

  if (params.hasSharedAuth) {
    return "shared";
  }

  if (params.hasUserAuth) {
    return "user";
  }

  return "user";
}
