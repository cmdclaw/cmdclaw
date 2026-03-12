"use client";

import { resolveDefaultChatModel } from "@cmdclaw/core/lib/chat-model-defaults";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { normalizeChatModelReference } from "@/lib/chat-model-reference";

const STORAGE_KEY = "chat-selected-model-v1";

type ChatModelState = {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
};

export const useChatModelStore = create<ChatModelState>()(
  persist(
    (set) => ({
      selectedModel: normalizeChatModelReference(
        resolveDefaultChatModel({ isOpenAIConnected: false }),
      ),
      setSelectedModel: (model) => {
        const trimmed = normalizeChatModelReference(model);
        if (!trimmed) {
          return;
        }
        set({ selectedModel: trimmed });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ selectedModel: state.selectedModel }),
    },
  ),
);
