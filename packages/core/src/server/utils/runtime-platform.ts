export function isStatelessServerlessRuntime(): boolean {
  // Render runs this app as long-running services.
  return false;
}
