import { describe, expect, it } from "vitest";
import { getExecutorDisplayMetadata } from "./executor-tool";

describe("getExecutorDisplayMetadata", () => {
  it("prioritizes the matched source over built-in executor helper names", () => {
    const result = getExecutorDisplayMetadata(
      {
        code: "const schema = await tools.describe.tool({ path: 'linear.mcp.list_issues' });\nreturn schema;",
      },
      [{ namespace: "linear-mcp", kind: "mcp", name: "linear-mcp" }],
    );

    expect(result.displayName).toBe("linear-mcp MCP");
    expect(result.source).toMatchObject({ namespace: "linear-mcp", kind: "mcp" });
  });

  it("uses namespace and kind when calling a source-backed tool without a loaded source row", () => {
    const result = getExecutorDisplayMetadata({
      code: "return await tools['linear.mcp.list_issues']({ assignee: 'me' });",
    });

    expect(result.displayName).toBe("Linear MCP · list issues");
    expect(result.integration).toBe("linear");
  });

  it("matches configured sources by normalized names in executor code", () => {
    const result = getExecutorDisplayMetadata(
      {
        code: "const schema = await tools.describe.tool({ path: 'linear.mcp.list_issues' });\nreturn schema;",
      },
      [{ namespace: "linear-mcp", kind: "mcp", name: "linear-mcp" }],
    );

    expect(result.source).toMatchObject({ namespace: "linear-mcp", kind: "mcp" });
  });
});
