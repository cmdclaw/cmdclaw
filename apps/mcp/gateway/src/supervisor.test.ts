import { describe, expect, it } from "vitest";
import { getManagedChildMode, shouldManageGatewayChildren } from "./supervisor";

describe("gateway supervisor config", () => {
  it("enables managed children only when requested", () => {
    expect(shouldManageGatewayChildren({ MCP_GATEWAY_MANAGED_CHILDREN: "true" })).toBe(true);
    expect(shouldManageGatewayChildren({ MCP_GATEWAY_MANAGED_CHILDREN: "false" })).toBe(false);
  });

  it("defaults child mode to dev", () => {
    expect(getManagedChildMode({})).toBe("dev");
    expect(getManagedChildMode({ MCP_GATEWAY_CHILD_MODE: "start" })).toBe("start");
  });
});
