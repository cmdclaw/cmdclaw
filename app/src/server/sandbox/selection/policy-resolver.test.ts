import { describe, expect, it, vi } from "vitest";

const state = {
  SANDBOX_DEFAULT: "e2b" as "e2b" | "daytona" | "docker",
  SANDBOX_AGENT_RUNTIME: "opencode" as "opencode" | "agentsdk",
};

vi.mock("@/env", () => ({
  env: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "SANDBOX_DEFAULT") {
          return state.SANDBOX_DEFAULT;
        }
        if (prop === "SANDBOX_AGENT_RUNTIME") {
          return state.SANDBOX_AGENT_RUNTIME;
        }
        return undefined;
      },
    },
  ),
}));

import { resolveRuntimeSelection } from "./policy-resolver";

describe("resolveRuntimeSelection", () => {
  it("maps opencode runtime", () => {
    state.SANDBOX_DEFAULT = "e2b";
    state.SANDBOX_AGENT_RUNTIME = "opencode";

    expect(resolveRuntimeSelection()).toEqual({
      sandboxProvider: "e2b",
      runtimeHarness: "opencode",
      runtimeProtocolVersion: "opencode-v2",
    });
  });

  it("maps sandbox-agent runtime", () => {
    state.SANDBOX_DEFAULT = "daytona";
    state.SANDBOX_AGENT_RUNTIME = "agentsdk";

    expect(resolveRuntimeSelection()).toEqual({
      sandboxProvider: "daytona",
      runtimeHarness: "agent-sdk",
      runtimeProtocolVersion: "sandbox-agent-v1",
    });
  });

  it("maps docker provider", () => {
    state.SANDBOX_DEFAULT = "docker";
    state.SANDBOX_AGENT_RUNTIME = "opencode";

    expect(resolveRuntimeSelection()).toEqual({
      sandboxProvider: "docker",
      runtimeHarness: "opencode",
      runtimeProtocolVersion: "opencode-v2",
    });
  });
});
