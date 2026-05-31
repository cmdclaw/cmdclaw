export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: unknown;
};

function stringifyToolContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function toMcpToolResult(structuredContent: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: stringifyToolContent(structuredContent) }],
    structuredContent,
  };
}
