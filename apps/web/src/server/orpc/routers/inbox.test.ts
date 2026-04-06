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
  coworkerRunFindManyMock,
  coworkerRunFindFirstMock,
  conversationFindManyMock,
  conversationFindFirstMock,
  userFindFirstMock,
  generationFindManyMock,
  generationFindFirstMock,
  generationInterruptFindManyMock,
  generationInterruptFindFirstMock,
  inboxReadStateFindManyMock,
  insertMock,
  insertValuesMock,
  insertOnConflictDoUpdateMock,
  dbMock,
  generationManagerMock,
} = vi.hoisted(() => {
  const coworkerRunFindManyMock = vi.fn();
  const coworkerRunFindFirstMock = vi.fn();
  const conversationFindManyMock = vi.fn();
  const conversationFindFirstMock = vi.fn();
  const userFindFirstMock = vi.fn();
  const generationFindManyMock = vi.fn();
  const generationFindFirstMock = vi.fn();
  const generationInterruptFindManyMock = vi.fn();
  const generationInterruptFindFirstMock = vi.fn();
  const inboxReadStateFindManyMock = vi.fn();
  const insertOnConflictDoUpdateMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdateMock,
  }));
  const insertMock = vi.fn(() => ({
    values: insertValuesMock,
  }));

  const dbMock = {
    query: {
      coworkerRun: {
        findMany: coworkerRunFindManyMock,
        findFirst: coworkerRunFindFirstMock,
      },
      conversation: {
        findMany: conversationFindManyMock,
        findFirst: conversationFindFirstMock,
      },
      user: {
        findFirst: userFindFirstMock,
      },
      generation: {
        findMany: generationFindManyMock,
        findFirst: generationFindFirstMock,
      },
      generationInterrupt: {
        findMany: generationInterruptFindManyMock,
        findFirst: generationInterruptFindFirstMock,
      },
      inboxReadState: {
        findMany: inboxReadStateFindManyMock,
      },
    },
    insert: insertMock,
  };

  const generationManagerMock = {
    submitApproval: vi.fn(),
    enqueueConversationMessage: vi.fn(),
  };

  return {
    coworkerRunFindManyMock,
    coworkerRunFindFirstMock,
    conversationFindManyMock,
    conversationFindFirstMock,
    userFindFirstMock,
    generationFindManyMock,
    generationFindFirstMock,
    generationInterruptFindManyMock,
    generationInterruptFindFirstMock,
    inboxReadStateFindManyMock,
    insertMock,
    insertValuesMock,
    insertOnConflictDoUpdateMock,
    dbMock,
    generationManagerMock,
  };
});

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("../workspace-access", () => ({
  requireActiveWorkspaceAccess: vi.fn(async () => ({
    workspace: { id: "ws-1" },
    membership: { role: "member" },
  })),
}));

vi.mock("@cmdclaw/core/server/services/generation-manager", () => ({
  generationManager: generationManagerMock,
}));

import { inboxRouter } from "./inbox";

const context = {
  user: { id: "user-1" },
  db: dbMock,
};

const inboxRouterAny = inboxRouter as unknown as Record<
  string,
  (args: unknown) => Promise<unknown>
>;

describe("inboxRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ role: "admin" });
    insertOnConflictDoUpdateMock.mockResolvedValue(undefined);
    generationManagerMock.submitApproval.mockResolvedValue(true);
    generationManagerMock.enqueueConversationMessage.mockResolvedValue({ queuedMessageId: "qm-1" });
    inboxReadStateFindManyMock.mockResolvedValue([]);
  });

  it("forbids non-admin users from listing inbox items", async () => {
    userFindFirstMock.mockResolvedValue({ role: "user" });

    await expect(
      inboxRouterAny.list({
        input: {
          limit: 20,
          type: "all",
          statuses: [],
          query: "",
        },
        context,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Inbox is currently in beta and limited to admin users.",
    });
  });

  it("returns mixed actionable coworker and chat inbox rows sorted by updatedAt desc", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-1",
        coworkerId: "cw-1",
        generationId: "gen-1",
        status: "awaiting_approval",
        startedAt: new Date("2026-03-30T14:32:00.000Z"),
        finishedAt: null,
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: { id: "gen-1", conversationId: "conv-cw-1" },
        events: [{ createdAt: new Date("2026-03-30T14:40:00.000Z") }],
      },
      {
        id: "run-2",
        coworkerId: "cw-2",
        generationId: null,
        status: "error",
        startedAt: new Date("2026-03-30T10:00:00.000Z"),
        finishedAt: new Date("2026-03-30T10:05:00.000Z"),
        errorMessage: "Coworker failed",
        coworker: { id: "cw-2", name: "Lead Qualifier" },
        generation: null,
        events: [],
      },
    ]);
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        title: "Follow up with prospect",
        createdAt: new Date("2026-03-30T13:00:00.000Z"),
        updatedAt: new Date("2026-03-30T13:35:00.000Z"),
        currentGenerationId: "gen-2",
        generationStatus: "error",
      },
    ]);
    generationInterruptFindManyMock.mockResolvedValue([
      {
        generationId: "gen-1",
        kind: "runtime_permission",
        providerToolUseId: "tool-1",
        display: {
          title: "Slack send",
          integration: "slack",
          operation: "send",
          command: 'slack send --channel "#sales"',
          toolInput: { channel: "#sales", text: "hello" },
        },
        responsePayload: null,
      },
    ]);
    generationFindManyMock.mockResolvedValue([
      { id: "gen-1", errorMessage: null },
      { id: "gen-2", errorMessage: "Chat failed" },
    ]);

    const result = (await inboxRouterAny.list({
      input: {
        limit: 20,
        type: "all",
        statuses: [],
        query: "",
      },
      context,
    })) as {
      items: Array<Record<string, unknown>>;
      sourceOptions: Array<Record<string, unknown>>;
    };

    expect(result.sourceOptions).toEqual([
      { coworkerId: "cw-1", coworkerName: "Inbox Triage" },
      { coworkerId: "cw-2", coworkerName: "Lead Qualifier" },
    ]);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({
      kind: "coworker",
      runId: "run-1",
      status: "awaiting_approval",
      coworkerId: "cw-1",
      conversationId: "conv-cw-1",
      pendingApproval: {
        toolUseId: "tool-1",
        integration: "slack",
        operation: "send",
      },
    });
    expect(result.items[1]).toMatchObject({
      kind: "chat",
      conversationId: "conv-1",
      title: "Follow up with prospect",
      status: "error",
      errorMessage: "Chat failed",
    });
    expect(result.items[2]).toMatchObject({
      kind: "coworker",
      runId: "run-2",
      status: "error",
      errorMessage: "Coworker failed",
    });
  });

  it("applies type, source, status, and search filters before limiting", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-1",
        coworkerId: "cw-1",
        generationId: "gen-1",
        status: "awaiting_auth",
        startedAt: new Date("2026-03-30T14:32:00.000Z"),
        finishedAt: null,
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: { id: "gen-1", conversationId: "conv-cw-1" },
        events: [{ createdAt: new Date("2026-03-30T14:40:00.000Z") }],
      },
      {
        id: "run-2",
        coworkerId: "cw-2",
        generationId: "gen-2",
        status: "error",
        startedAt: new Date("2026-03-30T12:32:00.000Z"),
        finishedAt: null,
        errorMessage: "Different coworker",
        coworker: { id: "cw-2", name: "Another Coworker" },
        generation: { id: "gen-2", conversationId: "conv-cw-2" },
        events: [{ createdAt: new Date("2026-03-30T12:40:00.000Z") }],
      },
    ]);
    conversationFindManyMock.mockResolvedValue([]);
    generationInterruptFindManyMock.mockResolvedValue([
      {
        generationId: "gen-1",
        kind: "auth",
        providerToolUseId: "tool-auth",
        display: {
          title: "Google Auth",
          authSpec: { integrations: ["google_gmail"], reason: "Need Gmail" },
        },
        responsePayload: null,
      },
    ]);
    generationFindManyMock.mockResolvedValue([]);

    const result = (await inboxRouterAny.list({
      input: {
        limit: 20,
        type: "coworkers",
        statuses: ["awaiting_auth"],
        sourceCoworkerId: "cw-1",
        query: "inbox",
      },
      context,
    })) as { items: Array<Record<string, unknown>> };

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "coworker",
        runId: "run-1",
        status: "awaiting_auth",
        pendingAuth: {
          integrations: ["google_gmail"],
          connectedIntegrations: [],
          reason: "Need Gmail",
        },
      }),
    ]);
  });

  it("hides rows marked read until the row is updated again", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-1",
        coworkerId: "cw-1",
        generationId: "gen-1",
        status: "awaiting_approval",
        startedAt: new Date("2026-03-30T14:32:00.000Z"),
        finishedAt: null,
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: { id: "gen-1", conversationId: "conv-cw-1" },
        events: [{ createdAt: new Date("2026-03-30T14:40:00.000Z") }],
      },
    ]);
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        title: "Follow up with prospect",
        createdAt: new Date("2026-03-30T13:00:00.000Z"),
        updatedAt: new Date("2026-03-30T13:35:00.000Z"),
        currentGenerationId: "gen-2",
        generationStatus: "error",
      },
    ]);
    generationInterruptFindManyMock.mockResolvedValue([
      {
        generationId: "gen-1",
        kind: "runtime_permission",
        providerToolUseId: "tool-1",
        display: {
          title: "Slack send",
          integration: "slack",
          operation: "send",
          command: 'slack send --channel "#sales"',
          toolInput: { channel: "#sales", text: "hello" },
        },
        responsePayload: null,
      },
    ]);
    generationFindManyMock.mockResolvedValue([
      { id: "gen-1", errorMessage: null },
      { id: "gen-2", errorMessage: "Chat failed" },
    ]);
    inboxReadStateFindManyMock.mockResolvedValue([
      {
        itemKind: "coworker",
        itemId: "run-1",
        readAt: new Date("2026-03-30T14:45:00.000Z"),
      },
      {
        itemKind: "chat",
        itemId: "conv-1",
        readAt: new Date("2026-03-30T13:20:00.000Z"),
      },
    ]);

    const result = (await inboxRouterAny.list({
      input: {
        limit: 20,
        type: "all",
        statuses: [],
        query: "",
      },
      context,
    })) as { items: Array<Record<string, unknown>> };

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "chat",
        conversationId: "conv-1",
      }),
    ]);
  });

  it("marks an inbox row as read with an upsert", async () => {
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
    });

    const result = await inboxRouterAny.markAsRead({
      input: {
        kind: "chat",
        id: "conv-1",
      },
      context,
    });

    expect(result).toEqual({ success: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        itemKind: "chat",
        itemId: "conv-1",
      }),
    );
    expect(insertOnConflictDoUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("denies the approval, enqueues the edited request, and records a coworker user_interrupt", async () => {
    generationFindFirstMock.mockResolvedValue({
      id: "gen-1",
      conversationId: "conv-1",
      conversation: {
        id: "conv-1",
        userId: "user-1",
        workspaceId: "ws-1",
        type: "coworker",
      },
    });
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      type: "coworker",
      title: "Coworker run",
    });
    generationInterruptFindFirstMock.mockResolvedValue({
      id: "interrupt-1",
      kind: "runtime_permission",
      providerToolUseId: "tool-1",
      display: {
        title: "Slack send",
        integration: "slack",
        operation: "send",
        command: 'slack send --channel "#sales"',
        toolInput: { channel: "#sales", text: "hello" },
      },
    });
    coworkerRunFindFirstMock.mockResolvedValue({
      id: "run-1",
      generationId: "gen-1",
    });

    const result = await inboxRouterAny.editApprovalAndResend({
      input: {
        kind: "coworker",
        generationId: "gen-1",
        toolUseId: "tool-1",
        updatedToolInput: { channel: "#ops", text: "updated" },
        conversationId: "conv-1",
        runId: "run-1",
      },
      context,
    });

    expect(result).toEqual({ success: true });
    expect(generationManagerMock.submitApproval).toHaveBeenCalledWith(
      "gen-1",
      "tool-1",
      "deny",
      "user-1",
    );
    expect(generationManagerMock.enqueueConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        userId: "user-1",
        replaceExisting: false,
      }),
    );
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        coworkerRunId: "run-1",
        type: "user_interrupt",
        payload: expect.objectContaining({
          source: "edited_approval",
          toolUseId: "tool-1",
          updatedToolInput: { channel: "#ops", text: "updated" },
        }),
      }),
    );
  });
});
