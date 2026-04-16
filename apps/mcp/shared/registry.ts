export type McpServerSlug = "internal" | "gmail";

export type McpServerDefinition = {
  slug: McpServerSlug;
  name: string;
  publicBasePath: `/${string}`;
  internalTargetEnvVar: string;
  authStrategy: "none" | "managed_bearer";
  childRoot: string;
  installMetadata: {
    title: string;
    description: string;
  };
};

export const MCP_SERVER_REGISTRY: Record<McpServerSlug, McpServerDefinition> = {
  internal: {
    slug: "internal",
    name: "CmdClaw Internal MCP",
    publicBasePath: "/internal",
    internalTargetEnvVar: "CMDCLAW_INTERNAL_MCP_TARGET",
    authStrategy: "none",
    childRoot: "servers/internal",
    installMetadata: {
      title: "Internal MCP",
      description: "CmdClaw internal app tools",
    },
  },
  gmail: {
    slug: "gmail",
    name: "Gmail MCP",
    publicBasePath: "/gmail",
    internalTargetEnvVar: "CMDCLAW_GMAIL_MCP_TARGET",
    authStrategy: "managed_bearer",
    childRoot: "servers/gmail",
    installMetadata: {
      title: "Gmail MCP Server",
      description: "Read, search, draft, and send Gmail messages through CmdClaw",
    },
  },
};

export function getMcpServerDefinition(slug: string): McpServerDefinition | null {
  return MCP_SERVER_REGISTRY[slug as McpServerSlug] ?? null;
}

export function buildMcpPublicUrl(baseUrl: string, slug: McpServerSlug, path = "/mcp"): string {
  return new URL(`${MCP_SERVER_REGISTRY[slug].publicBasePath}${path}`, baseUrl).toString();
}
