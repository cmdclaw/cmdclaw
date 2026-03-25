import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createProcedureStub() {
  const stub = {
    input: vi.fn(),
    output: vi.fn(),
    handler: vi.fn((fn: unknown) => fn),
  };
  stub.input.mockReturnValue(stub);
  stub.output.mockReturnValue(stub);
  return stub;
}

const { conversationFindFirstMock, dbMock, getConversationUsageFromOpenCodeSessionMock } =
  vi.hoisted(() => {
    const conversationFindFirstMock = vi.fn();

    const dbMock = {
      query: {
        conversation: {
          findFirst: conversationFindFirstMock,
        },
      },
    };

    return {
      conversationFindFirstMock,
      dbMock,
      getConversationUsageFromOpenCodeSessionMock: vi.fn(),
    };
  });

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("@cmdclaw/core/server/services/memory-service", () => ({
  writeSessionTranscriptFromConversation: vi.fn(),
}));

vi.mock("@cmdclaw/core/server/services/opencode-session-snapshot-service", () => ({
  clearConversationSessionSnapshot: vi.fn(),
}));

vi.mock("@cmdclaw/core/server/services/conversation-usage-service", () => ({
  getConversationUsageFromOpenCodeSession: getConversationUsageFromOpenCodeSessionMock,
}));

import { conversationRouter } from "./conversation";

const context = {
  user: { id: "user-1" },
  db: dbMock,
};

const conversationRouterAny = conversationRouter as unknown as Record<
  string,
  (args: unknown) => Promise<unknown>
>;

describe("conversationRouter.getUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws not found when the conversation does not belong to the user", async () => {
    conversationFindFirstMock.mockResolvedValue(null);

    await expect(
      conversationRouterAny.getUsage({
        input: { id: "conv-missing" },
        context,
      }),
    ).rejects.toMatchObject(new ORPCError("NOT_FOUND", { message: "Conversation not found" }));
  });

  it("returns aggregated usage from the core usage service", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      model: "anthropic/claude-sonnet-4-6",
      authSource: null,
      lastSandboxProvider: "e2b",
      lastRuntimeHarness: "opencode",
    });
    getConversationUsageFromOpenCodeSessionMock.mockResolvedValue({
      inputTokens: 11,
      outputTokens: 13,
      totalTokens: 24,
      assistantMessageCount: 2,
      sessionId: "session-1",
      source: "restored_snapshot",
    });

    const result = await conversationRouterAny.getUsage({
      input: { id: "conv-1" },
      context,
    });

    expect(getConversationUsageFromOpenCodeSessionMock).toHaveBeenCalledWith({
      conversationId: "conv-1",
      userId: "user-1",
      model: "anthropic/claude-sonnet-4-6",
      authSource: null,
      sandboxProviderOverride: "e2b",
      runtimeHarness: "opencode",
    });
    expect(result).toEqual({
      inputTokens: 11,
      outputTokens: 13,
      totalTokens: 24,
      assistantMessageCount: 2,
      sessionId: "session-1",
      source: "restored_snapshot",
    });
  });

  it("propagates usage computation failures", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      model: "anthropic/claude-sonnet-4-6",
      authSource: null,
      lastSandboxProvider: "docker",
      lastRuntimeHarness: "opencode",
    });
    getConversationUsageFromOpenCodeSessionMock.mockRejectedValue(
      new Error("session restore failed"),
    );

    await expect(
      conversationRouterAny.getUsage({
        input: { id: "conv-1" },
        context,
      }),
    ).rejects.toThrow("session restore failed");
  });
});
