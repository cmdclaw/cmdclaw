type AgentsRouterStatus = "pending" | "idle";

export function isPendingAgentsPathChange({
  pathname,
  resolvedPathname,
  status,
}: {
  pathname: string;
  resolvedPathname?: string;
  status: AgentsRouterStatus;
}) {
  const isResolvedAgentsIndex = resolvedPathname === "/agents" || resolvedPathname === "/agents/";
  const isDetailTarget =
    pathname.startsWith("/agents/info/") || pathname.startsWith("/agents/edit/");

  if (isResolvedAgentsIndex && isDetailTarget) {
    return false;
  }

  return status === "pending" && resolvedPathname !== pathname;
}
