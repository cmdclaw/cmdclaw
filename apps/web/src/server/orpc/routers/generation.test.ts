import {
  GENERATION_ERROR_PHASES,
  START_GENERATION_ERROR_CODES,
} from "@cmdclaw/core/lib/generation-errors";
import { GenerationStartError } from "@cmdclaw/core/server/services/generation-start-error";
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

const {
  generationFindFirstMock,
  conversationFindFirstMock,
  generationInterruptFindFirstMock,
  dbMock,
  generationManagerMock,
} = vi.hoisted(() => {
  const generationFindFirstMock = vi.fn();
  const conversationFindFirstMock = vi.fn();
  const generationInterruptFindFirstMock = vi.fn();

  const dbMock = {
    query: {
      generation: {
        findFirst: generationFindFirstMock,
      },
      generationInterrupt: {
        findFirst: generationInterruptFindFirstMock,
      },
      conversation: {
        findFirst: conversationFindFirstMock,
      },
    },
  };

  const generationManagerMock = {
    startGeneration: vi.fn(),
    enqueueConversationMessage: vi.fn(),
    listConversationQueuedMessages: vi.fn(),
    removeConversationQueuedMessage: vi.fn(),
    updateConversationQueuedMessage: vi.fn(),
    subscribeToGeneration: vi.fn(),
    cancelGeneration: vi.fn(),
    submitApproval: vi.fn(),
    submitApprovalByInterrupt: vi.fn(),
    submitAuthResult: vi.fn(),
    submitAuthResultByInterrupt: vi.fn(),
    getGenerationStatus: vi.fn(),
    getGenerationForConversation: vi.fn(),
  };

  return {
    generationFindFirstMock,
    conversationFindFirstMock,
    generationInterruptFindFirstMock,
    dbMock,
    generationManagerMock,
  };
});

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: dbMock,
}));

vi.mock("@cmdclaw/core/server/services/generation-manager", () => ({
  generationManager: generationManagerMock,
}));

vi.mock("@cmdclaw/core/server/utils/observability", () => ({
  logServerEvent: vi.fn(),
}));

vi.mock("../workspace-access", () => ({
  requireActiveWorkspaceAccess: vi.fn(async () => ({
    workspace: { id: "ws-1" },
    membership: { role: "member" },
  })),
}));

import { generationRouter } from "./generation";

const context = { user: { id: "user-1" } };
const generationRouterAny = generationRouter as unknown as Record<
  string,
  (args: unknown) => Promise<unknown>
>;

describe("generationRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
      workspaceId: "ws-1",
      generationStatus: "idle",
      currentGenerationId: null,
    });
    generationFindFirstMock.mockResolvedValue({
      id: "gen-1",
      conversation: {
        userId: "user-1",
        workspaceId: "ws-1",
      },
    });
    generationInterruptFindFirstMock.mockResolvedValue({
      id: "interrupt-1",
      conversation: {
        userId: "user-1",
        workspaceId: "ws-1",
      },
    });
    generationManagerMock.cancelGeneration.mockResolvedValue(true);
    generationManagerMock.submitApproval.mockResolvedValue(true);
    generationManagerMock.submitApprovalByInterrupt.mockResolvedValue(true);
    generationManagerMock.submitAuthResult.mockResolvedValue(true);
    generationManagerMock.submitAuthResultByInterrupt.mockResolvedValue(true);
    generationManagerMock.enqueueConversationMessage.mockResolvedValue({
      queuedMessageId: "queue-1",
    });
    generationManagerMock.listConversationQueuedMessages.mockResolvedValue([
      {
        id: "queue-1",
        content: "next message",
        fileAttachments: [],
        selectedPlatformSkillSlugs: ["slack"],
        status: "queued",
        createdAt: new Date("2026-02-25T07:40:22.751Z"),
      },
    ]);
    generationManagerMock.removeConversationQueuedMessage.mockResolvedValue(true);
    generationManagerMock.updateConversationQueuedMessage.mockResolvedValue(true);
    generationManagerMock.getGenerationStatus.mockResolvedValue({
      status: "running",
      contentParts: [],
      pendingApproval: null,
      usage: { inputTokens: 1, outputTokens: 2 },
    });
  });

  it("enforces generation ownership in getGenerationStatus", async () => {
    generationFindFirstMock.mockResolvedValue({
      id: "gen-1",
      conversation: { userId: "another-user", workspaceId: "ws-1" },
    });

    await expect(
      generationRouterAny.getGenerationStatus({
        input: { generationId: "gen-1" },
        context,
      }),
    ).resolves.toBeNull();
  });

  it("enforces conversation ownership in getActiveGeneration", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      userId: "another-user",
      workspaceId: "ws-1",
      generationStatus: "idle",
      currentGenerationId: null,
    });

    await expect(
      generationRouterAny.getActiveGeneration({
        input: { conversationId: "conv-1" },
        context,
      }),
    ).resolves.toEqual({
      generationId: null,
      startedAt: null,
      errorMessage: null,
      pauseReason: null,
      debugRunDeadlineMs: null,
      contentParts: null,
      status: null,
    });
  });

  it("returns empty active-generation payload when conversation is missing", async () => {
    conversationFindFirstMock.mockResolvedValue(null);

    const result = await generationRouterAny.getActiveGeneration({
      input: { conversationId: "conv-missing" },
      context,
    });

    expect(result).toEqual({
      generationId: null,
      startedAt: null,
      errorMessage: null,
      pauseReason: null,
      debugRunDeadlineMs: null,
      contentParts: null,
      status: null,
    });
  });

  it("returns active generation from conversation durable state", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
      workspaceId: "ws-1",
      generationStatus: "generating",
      currentGenerationId: "gen-db",
    });
    generationFindFirstMock.mockResolvedValue({
      startedAt: null,
      errorMessage: null,
      completionReason: null,
      executionPolicy: null,
    });

    const result = await generationRouterAny.getActiveGeneration({
      input: { conversationId: "conv-1" },
      context,
    });

    expect(result).toEqual({
      generationId: "gen-db",
      startedAt: null,
      errorMessage: null,
      pauseReason: null,
      debugRunDeadlineMs: null,
      contentParts: null,
      status: "generating",
    });
  });

  it("falls back to the latest active generation when conversation durable state is stale", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
      workspaceId: "ws-1",
      generationStatus: "idle",
      currentGenerationId: null,
    });
    generationFindFirstMock.mockResolvedValue({
      id: "gen-parked",
      status: "awaiting_approval",
      startedAt: new Date("2026-02-25T07:40:22.751Z"),
      errorMessage: null,
      completionReason: null,
      executionPolicy: null,
      deadlineAt: null,
      contentParts: null,
      createdAt: new Date("2026-02-25T07:40:22.751Z"),
    });

    const result = await generationRouterAny.getActiveGeneration({
      input: { conversationId: "conv-1" },
      context,
    });

    expect(generationFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.any(Array),
      }),
    );
    expect(result).toEqual({
      generationId: "gen-parked",
      startedAt: "2026-02-25T07:40:22.751Z",
      errorMessage: null,
      pauseReason: null,
      debugRunDeadlineMs: null,
      contentParts: null,
      status: "awaiting_approval",
    });
  });

  it("returns persisted error message for errored active generation", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
      workspaceId: "ws-1",
      generationStatus: "error",
      currentGenerationId: "gen-db",
    });
    generationFindFirstMock.mockResolvedValue({
      startedAt: new Date("2026-02-25T07:40:22.751Z"),
      errorMessage: "401 insufficient permissions",
      completionReason: null,
      executionPolicy: null,
    });

    const result = await generationRouterAny.getActiveGeneration({
      input: { conversationId: "conv-1" },
      context,
    });

    expect(result).toEqual({
      generationId: "gen-db",
      startedAt: "2026-02-25T07:40:22.751Z",
      errorMessage: "401 insufficient permissions",
      pauseReason: null,
      debugRunDeadlineMs: null,
      contentParts: null,
      status: "error",
    });
  });

  it("returns paused run-deadline metadata for active generation", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
      workspaceId: "ws-1",
      generationStatus: "paused",
      currentGenerationId: "gen-paused",
    });
    generationFindFirstMock.mockResolvedValue({
      startedAt: new Date("2026-02-25T07:40:22.751Z"),
      errorMessage: null,
      completionReason: "run_deadline",
      executionPolicy: {
        debugRunDeadlineMs: 30_000,
      },
      contentParts: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "Bash",
          input: { command: "google-gmail list -l 30" },
        },
      ],
    });

    const result = await generationRouterAny.getActiveGeneration({
      input: { conversationId: "conv-1" },
      context,
    });

    expect(result).toEqual({
      generationId: "gen-paused",
      startedAt: "2026-02-25T07:40:22.751Z",
      errorMessage: null,
      pauseReason: "run_deadline",
      debugRunDeadlineMs: 30_000,
      contentParts: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "Bash",
          input: { command: "google-gmail list -l 30" },
        },
      ],
      status: "paused",
    });
  });

  it("derives paused run-deadline metadata from timestamps when execution policy no longer carries the debug budget", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
      workspaceId: "ws-1",
      generationStatus: "paused",
      currentGenerationId: "gen-paused",
    });
    generationFindFirstMock.mockResolvedValue({
      startedAt: new Date("2026-02-25T07:40:22.751Z"),
      errorMessage: null,
      completionReason: "run_deadline",
      executionPolicy: {
        allowSnapshotRestoreOnRun: false,
      },
      createdAt: new Date("2026-02-25T07:40:22.751Z"),
      deadlineAt: new Date("2026-02-25T07:40:52.751Z"),
      contentParts: null,
    });

    const result = await generationRouterAny.getActiveGeneration({
      input: { conversationId: "conv-1" },
      context,
    });

    expect(result).toEqual({
      generationId: "gen-paused",
      startedAt: "2026-02-25T07:40:22.751Z",
      errorMessage: null,
      pauseReason: "run_deadline",
      debugRunDeadlineMs: 30_000,
      contentParts: null,
      status: "paused",
    });
  });

  it("maps typed startGeneration failures to visible RPC errors", async () => {
    generationManagerMock.startGeneration.mockRejectedValueOnce(
      new GenerationStartError({
        generationErrorCode: START_GENERATION_ERROR_CODES.MODEL_ACCESS_DENIED,
        rpcCode: "BAD_REQUEST",
        message:
          "Selected ChatGPT model is not available for your current connection. Choose another model and retry.",
      }),
    );

    await expect(
      generationRouterAny.startGeneration({
        input: {
          content: "hello",
          model: "openai/gpt-5.4-mini",
        },
        context,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Selected ChatGPT model is not available for your current connection. Choose another model and retry.",
      data: {
        generationErrorCode: START_GENERATION_ERROR_CODES.MODEL_ACCESS_DENIED,
        phase: GENERATION_ERROR_PHASES.START_RPC,
      },
    });
  });

  it("passes debug lifecycle overrides through startGeneration", async () => {
    generationManagerMock.startGeneration.mockResolvedValueOnce({
      generationId: "gen-start",
      conversationId: "conv-start",
    });

    const result = await generationRouterAny.startGeneration({
      input: {
        content: "hello",
        model: "openai/gpt-5.4-mini",
        debugRunDeadlineMs: 60_000,
        debugApprovalHotWaitMs: 5_000,
      },
      context,
    });

    expect(result).toEqual({
      generationId: "gen-start",
      conversationId: "conv-start",
    });
    expect(generationManagerMock.startGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "hello",
        model: "openai/gpt-5.4-mini",
        debugRunDeadlineMs: 60_000,
        debugApprovalHotWaitMs: 5_000,
        userId: "user-1",
      }),
    );
  });

  it("passes cancel, approval, and auth calls through to generationManager", async () => {
    const cancelResult = await generationRouterAny.cancelGeneration({
      input: { generationId: "gen-1" },
      context,
    });
    const approvalResult = await generationRouterAny.submitApproval({
      input: {
        generationId: "gen-1",
        toolUseId: "tool-1",
        decision: "approve",
      },
      context,
    });
    const authResult = await generationRouterAny.submitAuthResult({
      input: { generationId: "gen-1", integration: "slack", success: true },
      context,
    });

    expect(cancelResult).toEqual({ success: true });
    expect(approvalResult).toEqual({ success: true });
    expect(authResult).toEqual({ success: true });

    expect(generationManagerMock.cancelGeneration).toHaveBeenCalledWith("gen-1", "user-1");
    expect(generationManagerMock.submitApproval).toHaveBeenCalledWith(
      "gen-1",
      "tool-1",
      "approve",
      "user-1",
      undefined,
    );
    expect(generationManagerMock.submitAuthResult).toHaveBeenCalledWith(
      "gen-1",
      "slack",
      true,
      "user-1",
    );
  });

  it("passes interrupt-based approval and auth calls through to generationManager", async () => {
    const approvalResult = await generationRouterAny.submitApproval({
      input: {
        interruptId: "interrupt-1",
        decision: "approve",
      },
      context,
    });
    const authResult = await generationRouterAny.submitAuthResult({
      input: { interruptId: "interrupt-1", integration: "slack", success: true },
      context,
    });

    expect(approvalResult).toEqual({ success: true });
    expect(authResult).toEqual({ success: true });

    expect(generationManagerMock.submitApprovalByInterrupt).toHaveBeenCalledWith(
      "interrupt-1",
      "approve",
      "user-1",
      undefined,
    );
    expect(generationManagerMock.submitAuthResultByInterrupt).toHaveBeenCalledWith(
      "interrupt-1",
      "slack",
      true,
      "user-1",
    );
  });

  it("queues a follow-up conversation message", async () => {
    const result = await generationRouterAny.enqueueConversationMessage({
      input: {
        conversationId: "conv-1",
        content: "follow up",
        selectedPlatformSkillSlugs: ["slack"],
        fileAttachments: [
          {
            name: "brief.txt",
            mimeType: "text/plain",
            dataUrl: "data:text/plain;base64,Zm9v",
          },
        ],
      },
      context,
    });

    expect(result).toEqual({ queuedMessageId: "queue-1" });
    expect(generationManagerMock.enqueueConversationMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      userId: "user-1",
      content: "follow up",
      selectedPlatformSkillSlugs: ["slack"],
      fileAttachments: [
        {
          name: "brief.txt",
          mimeType: "text/plain",
          dataUrl: "data:text/plain;base64,Zm9v",
        },
      ],
      replaceExisting: undefined,
    });
  });

  it("lists queued messages with ISO timestamps", async () => {
    const result = await generationRouterAny.listConversationQueuedMessages({
      input: { conversationId: "conv-1" },
      context,
    });

    expect(result).toEqual([
      {
        id: "queue-1",
        content: "next message",
        fileAttachments: [],
        selectedPlatformSkillSlugs: ["slack"],
        status: "queued",
        createdAt: "2026-02-25T07:40:22.751Z",
      },
    ]);
    expect(generationManagerMock.listConversationQueuedMessages).toHaveBeenCalledWith(
      "conv-1",
      "user-1",
    );
  });

  it("returns empty queued messages when conversation does not exist anymore", async () => {
    generationManagerMock.listConversationQueuedMessages.mockRejectedValueOnce(
      new Error("Conversation not found"),
    );

    const result = await generationRouterAny.listConversationQueuedMessages({
      input: { conversationId: "conv-missing" },
      context,
    });

    expect(result).toEqual([]);
  });

  it("removes queued messages through generation manager", async () => {
    const result = await generationRouterAny.removeConversationQueuedMessage({
      input: { queuedMessageId: "queue-1", conversationId: "conv-1" },
      context,
    });

    expect(result).toEqual({ success: true });
    expect(generationManagerMock.removeConversationQueuedMessage).toHaveBeenCalledWith(
      "queue-1",
      "conv-1",
      "user-1",
    );
  });

  it("updates queued messages through generation manager", async () => {
    const result = await generationRouterAny.updateConversationQueuedMessage({
      input: {
        queuedMessageId: "queue-1",
        conversationId: "conv-1",
        content: "edited follow up",
        selectedPlatformSkillSlugs: ["slack"],
        fileAttachments: [
          {
            name: "brief.txt",
            mimeType: "text/plain",
            dataUrl: "data:text/plain;base64,Zm9v",
          },
        ],
      },
      context,
    });

    expect(result).toEqual({ success: true });
    expect(generationManagerMock.updateConversationQueuedMessage).toHaveBeenCalledWith({
      queuedMessageId: "queue-1",
      conversationId: "conv-1",
      userId: "user-1",
      content: "edited follow up",
      selectedPlatformSkillSlugs: ["slack"],
      fileAttachments: [
        {
          name: "brief.txt",
          mimeType: "text/plain",
          dataUrl: "data:text/plain;base64,Zm9v",
        },
      ],
    });
  });
});
