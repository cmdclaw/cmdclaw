import { initializeObservabilityRuntime } from "@cmdclaw/core/server/utils/observability";

export function registerNodeInstrumentation() {
  initializeObservabilityRuntime("cmdclaw-web");
}
