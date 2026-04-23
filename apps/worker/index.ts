import { initializeObservabilityRuntime } from "@cmdclaw/core/server/utils/observability";
import { startWorkerRuntime } from "@cmdclaw/core/worker-runtime";

initializeObservabilityRuntime("cmdclaw-worker");

void startWorkerRuntime();
