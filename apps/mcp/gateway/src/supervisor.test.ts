import { describe, expect, it } from "vitest";
import {
  getManagedChildMode,
  parseMcpChildListeningPort,
  shouldManageGatewayChildren,
} from "./supervisor";

describe("gateway supervisor config", () => {
  it("enables managed children only when requested", () => {
    expect(shouldManageGatewayChildren({ MCP_GATEWAY_MANAGED_CHILDREN: "true" })).toBe(true);
    expect(shouldManageGatewayChildren({ MCP_GATEWAY_MANAGED_CHILDREN: "false" })).toBe(false);
  });

  it("defaults child mode to dev", () => {
    expect(getManagedChildMode({})).toBe("dev");
    expect(getManagedChildMode({ MCP_GATEWAY_CHILD_MODE: "start" })).toBe("start");
  });

  it("parses the actual child listening port from xmcp startup output", () => {
    expect(
      parseMcpChildListeningPort(
        "✔ MCP Server running on http://127.0.0.1:4102/mcp",
        "127.0.0.1",
      ),
    ).toBe(4102);
  });

  it("ignores unrelated child log lines", () => {
    expect(parseMcpChildListeningPort("✔ Built HTTP server", "127.0.0.1")).toBeNull();
    expect(
      parseMcpChildListeningPort(
        "✔ MCP Server running on http://0.0.0.0:4102/mcp",
        "127.0.0.1",
      ),
    ).toBeNull();
  });
});
