"use client";

import { resolveDefaultChatModel } from "@cmdclaw/core/lib/chat-model-defaults";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const STORAGE_KEY = "chat-selected-model-v1";

type ChatModelState = {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
};

export const useChatModelStore = create<ChatModelState>()(
  persist(
    (set) => ({
      selectedModel: resolveDefaultChatModel({ isOpenAIConnected: false }),
      setSelectedModel: (model) => {
        const trimmed = model.trim();
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
