import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrCreateSandboxForCloudProviderMock = vi.fn();
const completeSessionInitForCloudProviderMock = vi.fn();
const createRuntimeHarnessClientFromOpencodeClientMock = vi.fn();

vi.mock("../opencode-session", () => ({
  getOrCreateSandboxForCloudProvider: getOrCreateSandboxForCloudProviderMock,
  completeSessionInitForCloudProvider: completeSessionInitForCloudProviderMock,
}));

vi.mock("../compat/opencode-client-shim", () => ({
  createRuntimeHarnessClientFromOpencodeClient: createRuntimeHarnessClientFromOpencodeClientMock,
}));

describe("runConversationSessionPipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getOrCreateSandboxForCloudProviderMock.mockReset();
    completeSessionInitForCloudProviderMock.mockReset();
    createRuntimeHarnessClientFromOpencodeClientMock.mockReset();
  });

  it("uses the resolved sandbox provider instead of the env default", async () => {
    const harnessClient = { kind: "runtime-client" };
    const opencodeClient = { kind: "opencode-client" };
    const sandboxInit = {
      sandbox: {
        provider: "docker",
        sandboxId: "sandbox-123",
        commands: {
          run: vi.fn(),
        },
        files: {
          write: vi.fn(),
          read: vi.fn(),
        },
      },
      reused: false,
      connectAgent: vi.fn(),
    };

    getOrCreateSandboxForCloudProviderMock.mockResolvedValue(sandboxInit);
    completeSessionInitForCloudProviderMock.mockResolvedValue({
      client: opencodeClient,
      sessionId: "session-123",
      sessionSource: "live_session",
      sandbox: sandboxInit.sandbox,
    });
    createRuntimeHarnessClientFromOpencodeClientMock.mockReturnValue(harnessClient);

    const { runConversationSessionPipeline } = await import("./session-pipeline");

    const result = await runConversationSessionPipeline({
      context: {
        conversationId: "conv-1",
        generationId: "gen-1",
        userId: "user-1",
        model: "anthropic/claude-sonnet-4-6",
        anthropicApiKey: "test-key",
      },
      selection: {
        sandboxProvider: "docker",
        runtimeHarness: "agent-sdk",
        runtimeProtocolVersion: "sandbox-agent-v1",
      },
      options: {
        title: "Conversation",
        replayHistory: true,
        allowSnapshotRestore: true,
      },
    });

    expect(getOrCreateSandboxForCloudProviderMock).toHaveBeenCalledWith(
      "docker",
      {
        conversationId: "conv-1",
        generationId: "gen-1",
        userId: "user-1",
        model: "anthropic/claude-sonnet-4-6",
        anthropicApiKey: "test-key",
        integrationEnvs: undefined,
      },
      {
        title: "Conversation",
        replayHistory: true,
        allowSnapshotRestore: true,
        onLifecycle: undefined,
        telemetry: undefined,
      },
    );
    expect(completeSessionInitForCloudProviderMock).toHaveBeenCalledWith(
      "docker",
      sandboxInit,
      {
        conversationId: "conv-1",
        generationId: "gen-1",
        userId: "user-1",
        model: "anthropic/claude-sonnet-4-6",
        anthropicApiKey: "test-key",
        integrationEnvs: undefined,
      },
      {
        title: "Conversation",
        replayHistory: true,
        allowSnapshotRestore: true,
        onLifecycle: undefined,
        telemetry: undefined,
      },
    );
    expect(result.metadata).toEqual({
      sandboxProvider: "docker",
      runtimeHarness: "agent-sdk",
      runtimeProtocolVersion: "sandbox-agent-v1",
    });
    expect(result.session).toEqual({ id: "session-123" });
    expect(result.sessionSource).toBe("live_session");
    expect(result.harnessClient).toBe(harnessClient);
    expect(result.sandbox.provider).toBe("docker");
    expect(result.sandbox.sandboxId).toBe("sandbox-123");
  });

  it("returns sandbox init before completing agent init", async () => {
    const sandboxInit = {
      sandbox: {
        provider: "docker",
        sandboxId: "sandbox-123",
        commands: {
          run: vi.fn(),
        },
        files: {
          write: vi.fn(),
          read: vi.fn(),
        },
      },
      reused: true,
      connectAgent: vi.fn(),
    };
    const harnessClient = { kind: "runtime-client" };
    const opencodeClient = { kind: "opencode-client" };

    getOrCreateSandboxForCloudProviderMock.mockResolvedValue(sandboxInit);
    completeSessionInitForCloudProviderMock.mockResolvedValue({
      client: opencodeClient,
      sessionId: "session-123",
      sessionSource: "live_session",
      sandbox: sandboxInit.sandbox,
    });
    createRuntimeHarnessClientFromOpencodeClientMock.mockReturnValue(harnessClient);

    const { runConversationSandboxPipeline } = await import("./session-pipeline");
    const result = await runConversationSandboxPipeline({
      context: {
        conversationId: "conv-1",
        generationId: "gen-1",
        userId: "user-1",
        model: "anthropic/claude-sonnet-4-6",
        anthropicApiKey: "test-key",
      },
      selection: {
        sandboxProvider: "docker",
        runtimeHarness: "agent-sdk",
        runtimeProtocolVersion: "sandbox-agent-v1",
      },
    });

    expect(result.sandbox.sandboxId).toBe("sandbox-123");
    expect(completeSessionInitForCloudProviderMock).not.toHaveBeenCalled();

    const agentInit = await result.completeAgentInit();
    expect(agentInit.session).toEqual({ id: "session-123" });
    expect(agentInit.harnessClient).toBe(harnessClient);
    expect(completeSessionInitForCloudProviderMock).toHaveBeenCalledTimes(1);
  });
});
