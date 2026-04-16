import { describe, expect, it } from "vitest";
import { routeMcpRequest } from "./router";

describe("routeMcpRequest", () => {
  const env = {
    CMDCLAW_INTERNAL_MCP_TARGET: "http://127.0.0.1:4101",
    CMDCLAW_GMAIL_MCP_TARGET: "http://127.0.0.1:4102",
  };

  it("routes internal MCP requests", () => {
    const routed = routeMcpRequest(new URL("https://mcp.cmdclaw.ai/internal/mcp"), env);
    expect(routed?.slug).toBe("internal");
    expect(routed?.target.toString()).toBe("http://127.0.0.1:4101/mcp");
  });

  it("routes gmail well-known requests", () => {
    const routed = routeMcpRequest(
      new URL("https://mcp.cmdclaw.ai/gmail/.well-known/oauth-protected-resource"),
      env,
    );
    expect(routed?.target.toString()).toBe(
      "http://127.0.0.1:4102/.well-known/oauth-protected-resource",
    );
  });

  it("returns null for unknown slugs", () => {
    expect(routeMcpRequest(new URL("https://mcp.cmdclaw.ai/reddit/mcp"), env)).toBeNull();
  });
});
