"use client";

import type { ProviderAuthSource } from "@cmdclaw/core/lib/provider-auth-source";
import { DEFAULT_CONNECTED_CHATGPT_MODEL } from "@cmdclaw/core/lib/chat-model-defaults";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { normalizeChatModelSelection } from "@/lib/chat-model-selection";

const STORAGE_KEY = "chat-selected-model-v2";

type ChatModelState = {
  selectedModel: string;
  selectedAuthSource: ProviderAuthSource | null;
  setSelection: (input: { model: string; authSource?: ProviderAuthSource | null }) => void;
};

export const useChatModelStore = create<ChatModelState>()(
  persist(
    (set) => ({
      selectedModel: normalizeChatModelSelection({
        model: DEFAULT_CONNECTED_CHATGPT_MODEL,
      }).model,
      selectedAuthSource: normalizeChatModelSelection({
        model: DEFAULT_CONNECTED_CHATGPT_MODEL,
      }).authSource,
      setSelection: (input) => {
        const normalized = normalizeChatModelSelection(input);
        if (!normalized.model) {
          return;
        }
        set({
          selectedModel: normalized.model,
          selectedAuthSource: normalized.authSource,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        selectedAuthSource: state.selectedAuthSource,
      }),
    },
  ),
);
