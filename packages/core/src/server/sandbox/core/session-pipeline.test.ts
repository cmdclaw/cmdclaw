import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrCreateSessionForCloudProviderMock = vi.fn();
const createRuntimeHarnessClientFromOpencodeClientMock = vi.fn();

vi.mock("../opencode-session", () => ({
  getOrCreateSessionForCloudProvider: getOrCreateSessionForCloudProviderMock,
}));

vi.mock("../compat/opencode-client-shim", () => ({
  createRuntimeHarnessClientFromOpencodeClient: createRuntimeHarnessClientFromOpencodeClientMock,
}));

describe("runConversationSessionPipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getOrCreateSessionForCloudProviderMock.mockReset();
    createRuntimeHarnessClientFromOpencodeClientMock.mockReset();
  });

  it("uses the resolved sandbox provider instead of the env default", async () => {
    const harnessClient = { kind: "runtime-client" };
    const opencodeClient = { kind: "opencode-client" };

    getOrCreateSessionForCloudProviderMock.mockResolvedValue({
      client: opencodeClient,
      sessionId: "session-123",
      sessionSource: "live_session",
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

    expect(getOrCreateSessionForCloudProviderMock).toHaveBeenCalledWith(
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
});
