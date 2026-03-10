import { afterEach, describe, expect, it, vi } from "vitest";

type SandboxProvider = "e2b" | "daytona" | "docker";
type SandboxRuntime = "opencode" | "agentsdk";

const originalSandboxEnv = {
  SANDBOX_DEFAULT: process.env.SANDBOX_DEFAULT,
  SANDBOX_AGENT_RUNTIME: process.env.SANDBOX_AGENT_RUNTIME,
};

async function loadPolicyResolverModule() {
  vi.resetModules();
  return import("./policy-resolver");
}

function setSandboxEnv(params: {
  sandboxDefault: SandboxProvider;
  sandboxAgentRuntime: SandboxRuntime;
}) {
  process.env.SANDBOX_DEFAULT = params.sandboxDefault;
  process.env.SANDBOX_AGENT_RUNTIME = params.sandboxAgentRuntime;
}

describe("resolveRuntimeSelection", () => {
  afterEach(() => {
    if (originalSandboxEnv.SANDBOX_DEFAULT === undefined) {
      delete process.env.SANDBOX_DEFAULT;
    } else {
      process.env.SANDBOX_DEFAULT = originalSandboxEnv.SANDBOX_DEFAULT;
    }

    if (originalSandboxEnv.SANDBOX_AGENT_RUNTIME === undefined) {
      delete process.env.SANDBOX_AGENT_RUNTIME;
    } else {
      process.env.SANDBOX_AGENT_RUNTIME = originalSandboxEnv.SANDBOX_AGENT_RUNTIME;
    }
  });

  it("maps opencode runtime", async () => {
    setSandboxEnv({
      sandboxDefault: "e2b",
      sandboxAgentRuntime: "opencode",
    });

    const { resolveRuntimeSelection } = await loadPolicyResolverModule();
    expect(resolveRuntimeSelection()).toEqual({
      sandboxProvider: "e2b",
      runtimeHarness: "opencode",
      runtimeProtocolVersion: "opencode-v2",
    });
  });

  it("maps sandbox-agent runtime", async () => {
    setSandboxEnv({
      sandboxDefault: "daytona",
      sandboxAgentRuntime: "agentsdk",
    });

    const { resolveRuntimeSelection } = await loadPolicyResolverModule();
    expect(resolveRuntimeSelection()).toEqual({
      sandboxProvider: "daytona",
      runtimeHarness: "agent-sdk",
      runtimeProtocolVersion: "sandbox-agent-v1",
    });
  });

  it("maps docker provider", async () => {
    setSandboxEnv({
      sandboxDefault: "docker",
      sandboxAgentRuntime: "opencode",
    });

    const { resolveRuntimeSelection } = await loadPolicyResolverModule();
    expect(resolveRuntimeSelection()).toEqual({
      sandboxProvider: "docker",
      runtimeHarness: "opencode",
      runtimeProtocolVersion: "opencode-v2",
    });
  });
});
