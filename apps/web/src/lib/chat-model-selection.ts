import type { ProviderAuthSource } from "@cmdclaw/core/lib/provider-auth-source";
import { parseModelReference } from "@cmdclaw/core/lib/model-reference";
import {
  normalizeModelAuthSource,
  resolveDefaultProviderAuthSource,
} from "@cmdclaw/core/lib/provider-auth-source";
import { normalizeChatModelReference } from "./chat-model-reference";

export type ChatModelSelection = {
  model: string;
  authSource: ProviderAuthSource | null;
};

export function normalizeChatModelSelection(input: {
  model: string | null | undefined;
  authSource?: ProviderAuthSource | null;
}): ChatModelSelection {
  const model = normalizeChatModelReference(input.model);
  if (!model) {
    return { model: "", authSource: null };
  }

  try {
    return {
      model,
      authSource: normalizeModelAuthSource({
        model,
        authSource: input.authSource,
      }),
    };
  } catch {
    return { model, authSource: null };
  }
}

export function resolveDefaultChatModelSelection(params: {
  model: string;
  hasUserOpenAI: boolean;
  hasSharedOpenAI: boolean;
}): ChatModelSelection {
  const normalized = normalizeChatModelSelection({
    model: params.model,
  });
  if (!normalized.model) {
    return normalized;
  }

  const { providerID } = parseModelReference(normalized.model);
  return {
    model: normalized.model,
    authSource: resolveDefaultProviderAuthSource({
      providerID,
      hasUserAuth: params.hasUserOpenAI,
      hasSharedAuth: params.hasSharedOpenAI,
    }),
  };
}
