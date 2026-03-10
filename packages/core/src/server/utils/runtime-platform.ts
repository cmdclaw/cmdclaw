export function isRailwayRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT_ID,
  );
}

export function isStatelessServerlessRuntime(): boolean {
  // Railway is deployed as a long-running process in this app.
  if (isRailwayRuntime()) {
    return false;
  }
  return false;
}
