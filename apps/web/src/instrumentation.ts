export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (process.env.NODE_ENV === "development") {
    return;
  }

  const observabilityModuleName = "@cmdclaw/core/server/utils/observability";
  const { initializeObservabilityRuntime } = await (0, eval)(
    `import("${observabilityModuleName}")`,
  );
  initializeObservabilityRuntime("cmdclaw-web");
}
