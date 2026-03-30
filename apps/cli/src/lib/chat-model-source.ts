import { parseModelReference } from "@cmdclaw/core/lib/model-reference";
import {
  getProviderDisplayName,
  normalizeModelAuthSource,
  providerSupportsAnyAuthSource,
  providerSupportsAuthSource,
  resolveProviderAuthAvailability,
  type ProviderAuthSource,
} from "@cmdclaw/core/lib/provider-auth-source";

export type ResolvedCliModelSelection = {
  authSource: ProviderAuthSource | null;
  model: string;
};

export function resolveCliModelSelection(params: {
  model: string;
  authSource?: ProviderAuthSource | null;
  connectedProviderIds?: readonly string[];
  sharedConnectedProviderIds?: readonly string[];
}): ResolvedCliModelSelection {
  const { providerID } = parseModelReference(params.model);

  if (!providerSupportsAnyAuthSource(providerID)) {
    if (params.authSource) {
      throw new Error(
        `Model provider "${providerID}" does not support --auth-source ${params.authSource}.`,
      );
    }
    return {
      model: params.model,
      authSource: null,
    };
  }

  if (params.authSource && !providerSupportsAuthSource(providerID, params.authSource)) {
    throw new Error(
      `Model provider "${providerID}" does not support --auth-source ${params.authSource}.`,
    );
  }

  const availability = resolveProviderAuthAvailability({
    providerID,
    connectedProviderIds: params.connectedProviderIds,
    sharedConnectedProviderIds: params.sharedConnectedProviderIds,
  });

  if (params.authSource) {
    if (!availability[params.authSource]) {
      throw new Error(getUnavailableSourceMessage(providerID, params.authSource));
    }
    return {
      model: params.model,
      authSource: params.authSource,
    };
  }

  const defaultAuthSource = normalizeModelAuthSource({
    model: params.model,
    authSource: null,
  });
  if (defaultAuthSource && availability[defaultAuthSource]) {
    return {
      model: params.model,
      authSource: defaultAuthSource,
    };
  }

  for (const fallbackSource of ["shared", "user"] as const) {
    if (providerSupportsAuthSource(providerID, fallbackSource) && availability[fallbackSource]) {
      return {
        model: params.model,
        authSource: fallbackSource,
      };
    }
  }

  throw new Error(getNoAvailableSourceMessage(providerID));
}

export function parseInteractiveModelCommand(input: string): {
  authSource?: ProviderAuthSource;
  model: string;
} {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("Usage: /model <provider/model> [--auth-source <user|shared>]");
  }

  const model = tokens[0]!;
  let authSource: ProviderAuthSource | undefined;

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--auth-source") {
      const value = tokens[index + 1];
      if (value !== "user" && value !== "shared") {
        throw new Error("Usage: /model <provider/model> [--auth-source <user|shared>]");
      }
      authSource = value;
      index += 1;
      continue;
    }

    throw new Error("Usage: /model <provider/model> [--auth-source <user|shared>]");
  }

  return {
    model,
    authSource,
  };
}

export function formatModelSelection(params: {
  model: string;
  authSource?: ProviderAuthSource | null;
}): string {
  const source = params.authSource ?? "none";
  return `${params.model} [source=${source}]`;
}

function getUnavailableSourceMessage(providerID: string, authSource: ProviderAuthSource): string {
  const providerLabel = getProviderDisplayName(providerID);
  if (authSource === "shared") {
    return `The shared ${providerLabel} source is not available. Ask an admin to reconnect it, then retry.`;
  }
  return `Your ${providerLabel} source is not available. Connect it in Settings > Connected AI Account, then retry.`;
}

function getNoAvailableSourceMessage(providerID: string): string {
  const providerLabel = getProviderDisplayName(providerID);
  return `No available ${providerLabel} source is connected for this model. Connect your account or use the shared workspace connection, then retry.`;
}
