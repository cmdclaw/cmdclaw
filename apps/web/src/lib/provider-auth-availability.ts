import { MODEL_PROVIDER_IDS, type ModelProviderID } from "@cmdclaw/core/lib/model-reference";
import {
  resolveProviderAuthAvailability,
  type ProviderAuthAvailability,
} from "@cmdclaw/core/lib/provider-auth-source";

export type ProviderAuthAvailabilityByProvider = Partial<
  Record<ModelProviderID, ProviderAuthAvailability>
>;

export function buildProviderAuthAvailabilityByProvider(params: {
  connectedProviders?: Record<string, unknown> | null;
  sharedConnectedProviders?: Record<string, unknown> | null;
}): ProviderAuthAvailabilityByProvider {
  const connectedProviderIds = Object.keys(params.connectedProviders ?? {});
  const sharedConnectedProviderIds = Object.keys(params.sharedConnectedProviders ?? {});

  return Object.fromEntries(
    MODEL_PROVIDER_IDS.map((providerID) => [
      providerID,
      resolveProviderAuthAvailability({
        providerID,
        connectedProviderIds,
        sharedConnectedProviderIds,
      }),
    ]),
  ) as ProviderAuthAvailabilityByProvider;
}
