import { describe, expect, it } from "vitest";
import {
  buildMutationInputFromForm,
  DEFAULT_EXECUTOR_SOURCE_FORM,
  normalizeWorkspaceMcpServerNamespace,
} from "./executor-source-form";

describe("executor-source-form", () => {
  it("normalizes namespaces into lowercase kebab-case", () => {
    expect(normalizeWorkspaceMcpServerNamespace("Sales Force Prod")).toBe("sales-force-prod");
    expect(normalizeWorkspaceMcpServerNamespace("mcp/internal.crm")).toBe("mcp-internal-crm");
  });

  it("derives an MCP namespace from the source name when requested", () => {
    const result = buildMutationInputFromForm(
      {
        ...DEFAULT_EXECUTOR_SOURCE_FORM,
        kind: "mcp",
        name: "Sales Force Prod",
        namespace: "",
        endpoint: "https://example.com/mcp",
        authType: "oauth2",
        transport: "",
      },
      { deriveNamespaceFromName: true },
    );

    expect(result).toMatchObject({
      kind: "mcp",
      name: "Sales Force Prod",
      namespace: "sales-force-prod",
      endpoint: "https://example.com/mcp",
      authType: "oauth2",
      transport: null,
      headers: undefined,
      queryParams: undefined,
    });
  });
});
