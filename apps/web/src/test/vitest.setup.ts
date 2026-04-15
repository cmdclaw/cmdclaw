import { config } from "dotenv";
import { afterAll, afterEach, beforeAll } from "vitest";
import { mswServer } from "@/test/msw/server";

for (const envFile of [".env.test.local", ".env.test", ".env"]) {
  config({ path: envFile, override: false });
}

const isLiveE2E = process.env.E2E_LIVE === "1";

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    callback?: ResizeObserverCallback;

    constructor(callback?: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(_target: Element) {}
    unobserve(_target: Element) {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
}

beforeAll(() => {
  if (isLiveE2E) {
    return;
  }
  mswServer.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  if (isLiveE2E) {
    return;
  }
  mswServer.resetHandlers();
});

afterAll(() => {
  if (isLiveE2E) {
    return;
  }
  mswServer.close();
});
