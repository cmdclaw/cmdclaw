export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { initializeObservabilityRuntime } =
    await import("@cmdclaw/core/server/utils/observability");
  initializeObservabilityRuntime("cmdclaw-web");
}
