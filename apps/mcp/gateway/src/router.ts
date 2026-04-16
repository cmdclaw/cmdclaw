import { getMcpServerDefinition } from "../../shared/registry";

export type RoutedMcpRequest = {
  slug: string;
  target: URL;
};

const WELL_KNOWN_PREFIX = "/.well-known/oauth-protected-resource";

function normalizeProxyPath(pathname: string): string {
  if (pathname === "/mcp" || pathname === WELL_KNOWN_PREFIX || pathname.startsWith("/auth/")) {
    return pathname;
  }

  if (pathname.startsWith("/mcp/")) {
    return pathname;
  }

  return `/mcp${pathname}`;
}

export function routeMcpRequest(
  requestUrl: URL,
  env: Record<string, string | undefined>,
): RoutedMcpRequest | null {
  const segments = requestUrl.pathname.split("/").filter(Boolean);
  const [slug, ...rest] = segments;
  if (!slug) {
    return null;
  }

  const server = getMcpServerDefinition(slug);
  if (!server) {
    return null;
  }

  const targetBase = env[server.internalTargetEnvVar]?.trim();
  if (!targetBase) {
    throw new Error(`Missing target for MCP server "${slug}" (${server.internalTargetEnvVar}).`);
  }

  const downstreamPath = normalizeProxyPath(`/${rest.join("/") || "mcp"}`);
  const target = new URL(downstreamPath + requestUrl.search, targetBase);

  return {
    slug,
    target,
  };
}
