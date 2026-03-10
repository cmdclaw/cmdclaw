import { describe, expect, it } from "vitest";
import { getRuntimeHarness } from "./registry";

describe("runtime harness registry", () => {
  it("returns opencode harness", () => {
    expect(getRuntimeHarness("opencode").id).toBe("opencode");
  });

  it("returns agent-sdk harness", () => {
    expect(getRuntimeHarness("agent-sdk").id).toBe("agent-sdk");
  });
});
