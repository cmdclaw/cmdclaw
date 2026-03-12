"use client";

const PENDING_COWORKER_PROMPT_KEY = "cmdclaw.pendingCoworkerPrompt";
const MAX_PENDING_PROMPT_AGE_MS = 10 * 60 * 1000;

type PendingCoworkerPrompt = {
  initialMessage: string;
  createdAt: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function clearPendingCoworkerPrompt() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(PENDING_COWORKER_PROMPT_KEY);
}

export function writePendingCoworkerPrompt(initialMessage: string) {
  if (!canUseStorage()) {
    return;
  }

  const trimmedMessage = initialMessage.trim();
  if (!trimmedMessage) {
    clearPendingCoworkerPrompt();
    return;
  }

  const payload: PendingCoworkerPrompt = {
    initialMessage: trimmedMessage,
    createdAt: Date.now(),
  };

  window.localStorage.setItem(PENDING_COWORKER_PROMPT_KEY, JSON.stringify(payload));
}

export function readPendingCoworkerPrompt(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(PENDING_COWORKER_PROMPT_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PendingCoworkerPrompt>;
    if (typeof parsed.initialMessage !== "string" || typeof parsed.createdAt !== "number") {
      clearPendingCoworkerPrompt();
      return null;
    }

    if (Date.now() - parsed.createdAt > MAX_PENDING_PROMPT_AGE_MS) {
      clearPendingCoworkerPrompt();
      return null;
    }

    const trimmedMessage = parsed.initialMessage.trim();
    if (!trimmedMessage) {
      clearPendingCoworkerPrompt();
      return null;
    }

    return trimmedMessage;
  } catch {
    clearPendingCoworkerPrompt();
    return null;
  }
}
