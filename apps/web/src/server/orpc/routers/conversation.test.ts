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

const { conversationFindFirstMock, dbMock } = vi.hoisted(() => {
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

  it("returns stored usage from the conversation row", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      inputTokens: 11,
      outputTokens: 13,
      totalTokens: 24,
      assistantMessageCount: 2,
      usageInputTokens: 11,
      usageOutputTokens: 13,
      usageTotalTokens: 24,
      usageAssistantMessageCount: 2,
    });

    const result = await conversationRouterAny.getUsage({
      input: { id: "conv-1" },
      context,
    });

    expect(result).toEqual({
      inputTokens: 11,
      outputTokens: 13,
      totalTokens: 24,
      assistantMessageCount: 2,
    });
  });

  it("returns zero usage when no assistant usage has been stored yet", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      usageInputTokens: 0,
      usageOutputTokens: 0,
      usageTotalTokens: 0,
      usageAssistantMessageCount: 0,
    });

    await expect(
      conversationRouterAny.getUsage({
        input: { id: "conv-1" },
        context,
      }),
    ).resolves.toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      assistantMessageCount: 0,
    });
  });
});
