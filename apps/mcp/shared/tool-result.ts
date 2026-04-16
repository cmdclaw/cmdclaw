export type McpToolResult = {
  structuredContent: unknown;
};

export function toMcpToolResult(structuredContent: unknown): McpToolResult {
  return {
    structuredContent,
  };
}
