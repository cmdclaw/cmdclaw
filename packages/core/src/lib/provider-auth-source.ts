import { parseModelReference, type ModelProviderID } from "./model-reference";

export const PROVIDER_AUTH_SOURCES = ["user", "shared"] as const;

export type ProviderAuthSource = (typeof PROVIDER_AUTH_SOURCES)[number];

export type ProviderAuthAvailability = {
  user: boolean;
  shared: boolean;
};

type AuthProviderID = "openai" | "google" | "kimi" | null;

type ProviderAuthCapability = {
  authProviderID: AuthProviderID;
  defaultAuthSource: ProviderAuthSource | null;
  displayName: string;
  supportedAuthSources: readonly ProviderAuthSource[];
};

const EMPTY_PROVIDER_AUTH_AVAILABILITY: ProviderAuthAvailability = {
  user: false,
  shared: false,
};

const PROVIDER_AUTH_CAPABILITIES: Record<ModelProviderID, ProviderAuthCapability> = {
  opencode: {
    authProviderID: null,
    defaultAuthSource: null,
    displayName: "OpenCode",
    supportedAuthSources: [],
  },
  anthropic: {
    authProviderID: null,
    defaultAuthSource: "shared",
    displayName: "Claude",
    supportedAuthSources: ["shared"],
  },
  openai: {
    authProviderID: "openai",
    defaultAuthSource: "shared",
    displayName: "ChatGPT",
    supportedAuthSources: ["user", "shared"],
  },
  google: {
    authProviderID: "google",
    defaultAuthSource: "shared",
    displayName: "Gemini",
    supportedAuthSources: ["shared"],
  },
  "kimi-for-coding": {
    authProviderID: "kimi",
    defaultAuthSource: "user",
    displayName: "Kimi",
    supportedAuthSources: ["user"],
  },
};

function getProviderAuthCapability(providerID: ModelProviderID | string): ProviderAuthCapability {
  return (
    PROVIDER_AUTH_CAPABILITIES[providerID as ModelProviderID] ?? {
      authProviderID: null,
      defaultAuthSource: null,
      displayName: providerID,
      supportedAuthSources: [],
    }
  );
}

export function getProviderAuthProviderID(providerID: ModelProviderID | string): AuthProviderID {
  return getProviderAuthCapability(providerID).authProviderID;
}

export function getProviderDisplayName(providerID: ModelProviderID | string): string {
  return getProviderAuthCapability(providerID).displayName;
}

export function listProviderSupportedAuthSources(
  providerID: ModelProviderID | string,
): readonly ProviderAuthSource[] {
  return getProviderAuthCapability(providerID).supportedAuthSources;
}

export function providerSupportsAnyAuthSource(providerID: ModelProviderID | string): boolean {
  return listProviderSupportedAuthSources(providerID).length > 0;
}

export function providerSupportsSharedAuth(providerID: ModelProviderID | string): boolean {
  return providerSupportsAuthSource(providerID, "shared");
}

export function providerSupportsAuthSource(
  providerID: ModelProviderID | string,
  authSource: ProviderAuthSource,
): boolean {
  return listProviderSupportedAuthSources(providerID).includes(authSource);
}

export function resolveProviderAuthAvailability(params: {
  providerID: ModelProviderID | string;
  connectedProviderIds?: readonly string[] | null;
  sharedConnectedProviderIds?: readonly string[] | null;
}): ProviderAuthAvailability {
  const capability = getProviderAuthCapability(params.providerID);
  const connectedProviderIds = new Set(params.connectedProviderIds ?? []);
  const sharedConnectedProviderIds = new Set(params.sharedConnectedProviderIds ?? []);
  const authProviderID = capability.authProviderID;

  return {
    user:
      capability.supportedAuthSources.includes("user") &&
      authProviderID !== null &&
      connectedProviderIds.has(authProviderID),
    shared:
      capability.supportedAuthSources.includes("shared") &&
      (authProviderID === null
        ? sharedConnectedProviderIds.has(params.providerID)
        : sharedConnectedProviderIds.has(authProviderID)),
  };
}

export function normalizeProviderAuthSource(params: {
  providerID: ModelProviderID | string;
  authSource?: ProviderAuthSource | null | undefined;
}): ProviderAuthSource | null {
  const capability = getProviderAuthCapability(params.providerID);
  if (capability.supportedAuthSources.length === 0) {
    return null;
  }

  if (params.authSource && capability.supportedAuthSources.includes(params.authSource)) {
    return params.authSource;
  }

  return capability.defaultAuthSource;
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
  const capability = getProviderAuthCapability(params.providerID);
  if (capability.supportedAuthSources.length === 0) {
    return null;
  }

  if (capability.supportedAuthSources.includes("shared") && params.hasSharedAuth) {
    return "shared";
  }

  if (capability.supportedAuthSources.includes("user") && params.hasUserAuth) {
    return "user";
  }

  return capability.defaultAuthSource;
}

export function resolveDefaultProviderAuthSourceForAvailability(params: {
  providerID: ModelProviderID | string;
  availability: ProviderAuthAvailability;
}): ProviderAuthSource | null {
  return resolveDefaultProviderAuthSource({
    providerID: params.providerID,
    hasSharedAuth: params.availability.shared,
    hasUserAuth: params.availability.user,
  });
}

export function getEmptyProviderAuthAvailability(): ProviderAuthAvailability {
  return { ...EMPTY_PROVIDER_AUTH_AVAILABILITY };
}
