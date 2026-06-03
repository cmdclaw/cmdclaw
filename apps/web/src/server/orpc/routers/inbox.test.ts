import { beforeEach, describe, expect, it, vi } from "vitest";

type VitestProcedure = Extract<
  NonNullable<Parameters<typeof vi.fn>[0]>,
  (...args: never[]) => unknown
>;

function createProcedureStub() {
  const stub = {
    input: vi.fn<VitestProcedure>(),
    output: vi.fn<VitestProcedure>(),
    handler: vi.fn<VitestProcedure>((fn: unknown) => fn),
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
  updateMock,
  updateSetMock,
  updateReturningMock,
  executeMock,
  dbMock,
  generationManagerMock,
} = vi.hoisted(() => {
  const coworkerRunFindManyMock = vi.fn<VitestProcedure>();
  const coworkerRunFindFirstMock = vi.fn<VitestProcedure>();
  const conversationFindManyMock = vi.fn<VitestProcedure>();
  const conversationFindFirstMock = vi.fn<VitestProcedure>();
  const userFindFirstMock = vi.fn<VitestProcedure>();
  const generationFindManyMock = vi.fn<VitestProcedure>();
  const generationFindFirstMock = vi.fn<VitestProcedure>();
  const generationInterruptFindManyMock = vi.fn<VitestProcedure>();
  const generationInterruptFindFirstMock = vi.fn<VitestProcedure>();
  const inboxReadStateFindManyMock = vi.fn<VitestProcedure>();
  const executeMock = vi.fn<VitestProcedure>();
  const insertOnConflictDoUpdateMock = vi.fn<VitestProcedure>();
  const insertValuesMock = vi.fn<VitestProcedure>(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdateMock,
  }));
  const insertMock = vi.fn<VitestProcedure>(() => ({
    values: insertValuesMock,
  }));
  const updateReturningMock = vi.fn<VitestProcedure>();
  const updateWhereMock = vi.fn<VitestProcedure>(() => ({
    returning: updateReturningMock,
  }));
  const updateSetMock = vi.fn<VitestProcedure>(() => ({
    where: updateWhereMock,
  }));
  const updateMock = vi.fn<VitestProcedure>(() => ({
    set: updateSetMock,
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
    update: updateMock,
    execute: executeMock,
  };

  const generationManagerMock = {
    submitApproval: vi.fn<VitestProcedure>(),
    enqueueConversationMessage: vi.fn<VitestProcedure>(),
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
    updateMock,
    updateSetMock,
    updateWhereMock,
    updateReturningMock,
    executeMock,
    dbMock,
    generationManagerMock,
  };
});

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("../workspace-access", () => ({
  requireActiveWorkspaceAccess: vi.fn<VitestProcedure>(async () => ({
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
    executeMock.mockResolvedValue({ rows: [] });
    updateReturningMock.mockResolvedValue([{ id: "run-pending" }]);
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

  it("returns coworker run history sorted by updatedAt desc", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-completed",
        coworkerId: "cw-1",
        generationId: "gen-completed",
        status: "completed",
        startedAt: new Date("2026-03-30T15:32:00.000Z"),
        finishedAt: new Date("2026-03-30T15:45:00.000Z"),
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: { id: "gen-completed", conversationId: "conv-cw-completed" },
        events: [],
      },
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
    conversationFindManyMock.mockResolvedValue([]);
    generationInterruptFindManyMock.mockResolvedValue([
      {
        id: "interrupt-1",
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
    generationFindManyMock.mockResolvedValue([{ id: "gen-1", errorMessage: null }]);
    executeMock.mockResolvedValue({
      rows: [
        {
          conversationId: "conv-cw-1",
          content: "I found the lead and drafted the Slack update.\n\n## Next step\nSend it today.",
        },
        {
          conversationId: "conv-cw-completed",
          content: "Completed the inbox review.",
        },
        {
          conversationId: "conv-cw-1",
          content: "Older agent update.",
        },
      ],
    });

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
      runId: "run-completed",
      status: "completed",
      conversationId: "conv-cw-completed",
      lastAgentMessage: "Completed the inbox review.",
    });
    expect(result.items[1]).toMatchObject({
      kind: "coworker",
      runId: "run-1",
      status: "awaiting_approval",
      coworkerId: "cw-1",
      conversationId: "conv-cw-1",
      lastAgentMessage:
        "I found the lead and drafted the Slack update.\n\n## Next step\nSend it today.",
      pendingApproval: {
        interruptId: "interrupt-1",
        toolUseId: "tool-1",
        integration: "slack",
        operation: "send",
      },
    });
    expect(result.items[2]).toMatchObject({
      kind: "coworker",
      runId: "run-2",
      status: "error",
      errorMessage: "Coworker failed",
    });
    expect(conversationFindManyMock).not.toHaveBeenCalled();
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
        id: "interrupt-auth-1",
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
          interruptId: "interrupt-auth-1",
          integrations: ["google_gmail"],
          connectedIntegrations: [],
          reason: "Need Gmail",
        },
      }),
    ]);
  });

  it("matches search against the latest agent message preview", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-1",
        coworkerId: "cw-1",
        generationId: "gen-1",
        status: "completed",
        startedAt: new Date("2026-03-30T14:32:00.000Z"),
        finishedAt: new Date("2026-03-30T14:40:00.000Z"),
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: { id: "gen-1", conversationId: "conv-cw-1" },
        events: [],
      },
    ]);
    generationInterruptFindManyMock.mockResolvedValue([]);
    generationFindManyMock.mockResolvedValue([{ id: "gen-1", errorMessage: null }]);
    executeMock.mockResolvedValue({
      rows: [
        {
          conversationId: "conv-cw-1",
          content: "Qualified the renewal request and sent the customer note.",
        },
      ],
    });

    const result = (await inboxRouterAny.list({
      input: {
        limit: 20,
        type: "coworkers",
        statuses: ["completed"],
        query: "renewal",
      },
      context,
    })) as { items: Array<Record<string, unknown>> };

    expect(result.items).toEqual([
      expect.objectContaining({
        runId: "run-1",
        lastAgentMessage: "Qualified the renewal request and sent the customer note.",
      }),
    ]);
  });

  it("returns older coworker runs after the inbox cursor", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-new",
        coworkerId: "cw-1",
        generationId: null,
        status: "completed",
        startedAt: new Date("2026-05-30T14:32:00.000Z"),
        finishedAt: new Date("2026-05-30T14:40:00.000Z"),
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: null,
        events: [],
      },
      {
        id: "run-middle",
        coworkerId: "cw-1",
        generationId: null,
        status: "completed",
        startedAt: new Date("2026-05-29T14:32:00.000Z"),
        finishedAt: new Date("2026-05-29T14:40:00.000Z"),
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: null,
        events: [],
      },
      {
        id: "run-old",
        coworkerId: "cw-1",
        generationId: null,
        status: "completed",
        startedAt: new Date("2026-05-28T14:32:00.000Z"),
        finishedAt: new Date("2026-05-28T14:40:00.000Z"),
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: null,
        events: [],
      },
    ]);
    generationInterruptFindManyMock.mockResolvedValue([]);
    generationFindManyMock.mockResolvedValue([]);

    const firstPage = (await inboxRouterAny.list({
      input: {
        limit: 2,
        type: "coworkers",
        statuses: ["completed"],
        query: "",
      },
      context,
    })) as { items: Array<Record<string, unknown>>; nextCursor?: string };

    expect(firstPage.items.map((item) => item.runId)).toEqual(["run-new", "run-middle"]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = (await inboxRouterAny.list({
      input: {
        limit: 2,
        cursor: firstPage.nextCursor,
        type: "coworkers",
        statuses: ["completed"],
        query: "",
      },
      context,
    })) as { items: Array<Record<string, unknown>>; nextCursor?: string };

    expect(secondPage.items.map((item) => item.runId)).toEqual(["run-old"]);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("lists pending coworker starts as Needs your input without querying chat statuses", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-pending",
        coworkerId: "cw-1",
        generationId: null,
        conversationId: "conv-pending",
        status: "needs_user_input",
        startedAt: new Date("2026-03-30T14:32:00.000Z"),
        finishedAt: null,
        errorMessage: null,
        coworker: { id: "cw-1", name: "Email Drafter" },
        generation: null,
        events: [{ createdAt: new Date("2026-03-30T14:40:00.000Z") }],
      },
    ]);
    conversationFindManyMock.mockResolvedValue([]);
    generationInterruptFindManyMock.mockResolvedValue([]);
    generationFindManyMock.mockResolvedValue([]);

    const result = (await inboxRouterAny.list({
      input: {
        limit: 20,
        type: "all",
        statuses: ["needs_user_input"],
        query: "",
      },
      context,
    })) as { items: Array<Record<string, unknown>> };

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "coworker",
        runId: "run-pending",
        status: "needs_user_input",
        generationId: null,
        conversationId: "conv-pending",
        coworkerName: "Email Drafter",
      }),
    ]);
    expect(conversationFindManyMock).not.toHaveBeenCalled();
  });

  it("keeps rows visible when they have been marked read", async () => {
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
    conversationFindManyMock.mockResolvedValue([]);
    generationInterruptFindManyMock.mockResolvedValue([
      {
        id: "interrupt-1",
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
    generationFindManyMock.mockResolvedValue([{ id: "gen-1", errorMessage: null }]);
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
        kind: "coworker",
        runId: "run-1",
      }),
    ]);
    expect(conversationFindManyMock).not.toHaveBeenCalled();
  });

  it("includes paused coworker runs", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-paused",
        coworkerId: "cw-1",
        generationId: "gen-paused",
        status: "paused",
        startedAt: new Date("2026-03-30T14:32:00.000Z"),
        finishedAt: null,
        errorMessage: null,
        coworker: { id: "cw-1", name: "Inbox Triage" },
        generation: { id: "gen-paused", conversationId: "conv-cw-1" },
        events: [{ createdAt: new Date("2026-03-30T14:40:00.000Z") }],
      },
    ]);
    conversationFindManyMock.mockResolvedValue([]);
    generationInterruptFindManyMock.mockResolvedValue([]);
    generationFindManyMock.mockResolvedValue([
      { id: "gen-paused", errorMessage: null, completionReason: "run_deadline" },
    ]);

    const result = (await inboxRouterAny.list({
      input: {
        limit: 20,
        type: "all",
        statuses: ["paused"],
        query: "",
      },
      context,
    })) as { items: Array<Record<string, unknown>> };

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "coworker",
        runId: "run-paused",
        status: "paused",
        pauseReason: "run_deadline",
      }),
    ]);
    expect(conversationFindManyMock).not.toHaveBeenCalled();
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

  it("dismisses a pending coworker start without using generation cancellation", async () => {
    const result = await inboxRouterAny.dismissCoworkerRun({
      input: { id: "run-pending" },
      context,
    });

    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        finishedAt: expect.any(Date),
      }),
    );
    expect(updateReturningMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith({
      coworkerRunId: "run-pending",
      type: "dismissed",
      payload: { source: "inbox" },
    });
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
