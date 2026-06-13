import { initializeObservabilityRuntime } from "@bap/core/server/utils/observability";

export function initializeWebObservabilityAtStartup(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  try {
    initializeObservabilityRuntime("bap-web");
  } catch (error) {
    console.error("[observability] Failed to initialize web observability runtime", error);
  }
}
