import { initializeObservabilityRuntime } from "@bap/core/server/utils/observability";
import { startWorkerRuntime } from "@bap/core/worker-runtime";

initializeObservabilityRuntime("bap-worker");

void startWorkerRuntime();
