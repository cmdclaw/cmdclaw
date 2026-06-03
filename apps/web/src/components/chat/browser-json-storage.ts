import type { StateStorage } from "zustand/middleware";
import { createJSONStorage } from "zustand/middleware";

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function isStateStorage(value: unknown): value is StateStorage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const storage = value as Partial<StateStorage>;
  return (
    typeof storage.getItem === "function" &&
    typeof storage.setItem === "function" &&
    typeof storage.removeItem === "function"
  );
}

export function createBrowserJsonStorage() {
  return createJSONStorage(() => {
    if (typeof window === "undefined" || !isStateStorage(window.localStorage)) {
      return noopStorage;
    }

    return window.localStorage;
  });
}
