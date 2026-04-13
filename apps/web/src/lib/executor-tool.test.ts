import { describe, expect, it } from "vitest";
import { getExecutorDisplayMetadata } from "./executor-tool";

describe("getExecutorDisplayMetadata", () => {
  it("uses the full built-in executor helper path for display names", () => {
    const result = getExecutorDisplayMetadata({
      code: "const schema = await tools.describe.tool({ path: 'linear.mcp.list_issues' });\nreturn schema;",
    });

    expect(result.displayName).toBe("Computer · describe tool");
  });

  it("uses namespace and kind when calling a source-backed tool without a loaded source row", () => {
    const result = getExecutorDisplayMetadata({
      code: "return await tools['linear.mcp.list_issues']({ assignee: 'me' });",
    });

    expect(result.displayName).toBe("Linear MCP · list issues");
    expect(result.integration).toBe("linear");
  });
});
