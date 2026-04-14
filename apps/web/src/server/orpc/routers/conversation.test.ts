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

const { conversationFindFirstMock, conversationFindManyMock, dbMock } = vi.hoisted(() => {
  const conversationFindFirstMock = vi.fn();
  const conversationFindManyMock = vi.fn();

  const dbMock = {
    query: {
      conversation: {
        findFirst: conversationFindFirstMock,
        findMany: conversationFindManyMock,
      },
    },
  };

  return {
    conversationFindFirstMock,
    conversationFindManyMock,
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

vi.mock("../workspace-access", () => ({
  requireActiveWorkspaceAccess: vi.fn(async () => ({
    workspace: { id: "ws-1" },
    membership: { role: "member" },
  })),
  requireActiveWorkspaceAdmin: vi.fn(async () => ({
    workspace: { id: "ws-1" },
    membership: { role: "admin" },
  })),
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
      type: "chat",
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
      type: "chat",
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

  it("returns stored usage for coworker conversations used by runs", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-run-1",
      type: "coworker",
      usageInputTokens: 17,
      usageOutputTokens: 5,
      usageTotalTokens: 22,
      usageAssistantMessageCount: 1,
    });

    await expect(
      conversationRouterAny.getUsage({
        input: { id: "conv-run-1" },
        context,
      }),
    ).resolves.toEqual({
      inputTokens: 17,
      outputTokens: 5,
      totalTokens: 22,
      assistantMessageCount: 1,
    });
  });
});

describe("conversationRouter.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an encoded cursor when another page exists", async () => {
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-new",
        title: "New",
        isPinned: true,
        isShared: false,
        generationStatus: "idle",
        createdAt: new Date("2026-04-10T10:00:00.000Z"),
        updatedAt: new Date("2026-04-10T10:00:00.000Z"),
        seenMessageCount: 1,
        messages: [{ id: "m-1" }],
      },
      {
        id: "conv-old",
        title: "Old",
        isPinned: false,
        isShared: false,
        generationStatus: "complete",
        createdAt: new Date("2026-04-09T09:00:00.000Z"),
        updatedAt: new Date("2026-04-09T09:00:00.000Z"),
        seenMessageCount: 2,
        messages: [{ id: "m-2" }, { id: "m-3" }],
      },
      {
        id: "conv-extra",
        title: "Extra",
        isPinned: false,
        isShared: false,
        generationStatus: "complete",
        createdAt: new Date("2026-04-08T08:00:00.000Z"),
        updatedAt: new Date("2026-04-08T08:00:00.000Z"),
        seenMessageCount: 0,
        messages: [],
      },
    ]);

    const result = (await conversationRouterAny.list({
      input: { limit: 2 },
      context,
    })) as {
      conversations: Array<{ id: string; messageCount: number }>;
      nextCursor?: string;
    };

    expect(result.conversations).toEqual([
      expect.objectContaining({ id: "conv-new", messageCount: 1 }),
      expect.objectContaining({ id: "conv-old", messageCount: 2 }),
    ]);
    expect(result.nextCursor).toBe(
      JSON.stringify({
        updatedAt: "2026-04-09T09:00:00.000Z",
        id: "conv-old",
        isPinned: false,
      }),
    );
  });

  it("rejects an invalid cursor", async () => {
    await expect(
      conversationRouterAny.list({
        input: { limit: 20, cursor: "not-json" },
        context,
      }),
    ).rejects.toMatchObject(
      new ORPCError("BAD_REQUEST", { message: "Invalid conversation list cursor" }),
    );
    expect(conversationFindManyMock).not.toHaveBeenCalled();
  });
});
