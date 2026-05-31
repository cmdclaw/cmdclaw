import { describe, expect, it } from "vitest";
import { toMcpToolResult } from "./tool-result";

describe("toMcpToolResult", () => {
  it("returns text content alongside structured content", () => {
    const result = toMcpToolResult({ data: [{ id: 1, name: "Naveu" }] });

    expect(result.structuredContent).toEqual({ data: [{ id: 1, name: "Naveu" }] });
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ data: [{ id: 1, name: "Naveu" }] }, null, 2),
      },
    ]);
  });
});
