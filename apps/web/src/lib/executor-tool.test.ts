import { describe, expect, it } from "vitest";
import { getExecutorDisplayMetadata } from "./executor-tool";

describe("getExecutorDisplayMetadata", () => {
  it("prioritizes the matched Workspace MCP Server over raw native tool names", () => {
    const result = getExecutorDisplayMetadata(
      { assignee: "me" },
      [{ namespace: "linear-mcp", kind: "mcp", name: "linear-mcp" }],
      "linear-mcp_list_issues",
    );

    expect(result.displayName).toBe("linear-mcp MCP · list issues");
    expect(result.source).toMatchObject({ namespace: "linear-mcp", kind: "mcp" });
  });

  it("uses namespace and operation when rendering a native MCP tool without a loaded server row", () => {
    const result = getExecutorDisplayMetadata({ assignee: "me" }, [], "linear-mcp.list_issues");

    expect(result.displayName).toBe("Linear MCP · list issues");
    expect(result.integration).toBe("linear");
  });

  it("matches configured Workspace MCP Servers by normalized native tool names", () => {
    const result = getExecutorDisplayMetadata(
      { assignee: "me" },
      [{ namespace: "linear-mcp", kind: "mcp", name: "linear-mcp" }],
      "linear-mcp.list_issues",
    );

    expect(result.source).toMatchObject({ namespace: "linear-mcp", kind: "mcp" });
  });
});
