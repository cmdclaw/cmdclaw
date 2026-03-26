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
  triggerCoworkerRunMock,
  syncCoworkerScheduleJobMock,
  removeCoworkerScheduleJobMock,
  generateCoworkerMetadataOnFirstPromptFillMock,
  normalizeAndEnsureUniqueCoworkerUsernameMock,
  applyCoworkerEditMock,
  uploadCoworkerDocumentMock,
  deleteCoworkerDocumentMock,
} = vi.hoisted(() => ({
  triggerCoworkerRunMock: vi.fn(),
  syncCoworkerScheduleJobMock: vi.fn(),
  removeCoworkerScheduleJobMock: vi.fn(),
  generateCoworkerMetadataOnFirstPromptFillMock: vi.fn(),
  normalizeAndEnsureUniqueCoworkerUsernameMock: vi.fn(),
  applyCoworkerEditMock: vi.fn(),
  uploadCoworkerDocumentMock: vi.fn(),
  deleteCoworkerDocumentMock: vi.fn(),
}));

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("@cmdclaw/core/server/services/coworker-service", () => ({
  triggerCoworkerRun: triggerCoworkerRunMock,
}));

vi.mock("@cmdclaw/core/server/services/coworker-scheduler", () => ({
  syncCoworkerScheduleJob: syncCoworkerScheduleJobMock,
  removeCoworkerScheduleJob: removeCoworkerScheduleJobMock,
}));

vi.mock("@cmdclaw/core/server/services/coworker-metadata", () => ({
  generateCoworkerMetadataOnFirstPromptFill: generateCoworkerMetadataOnFirstPromptFillMock,
  normalizeAndEnsureUniqueCoworkerUsername: normalizeAndEnsureUniqueCoworkerUsernameMock,
}));

vi.mock("@cmdclaw/core/server/services/coworker-builder-service", async () => {
  const actual = await vi.importActual<
    typeof import("@cmdclaw/core/server/services/coworker-builder-service")
  >("@cmdclaw/core/server/services/coworker-builder-service");
  return {
    ...actual,
    applyCoworkerEdit: applyCoworkerEditMock,
  };
});

vi.mock("@/server/services/coworker-document", () => ({
  deleteCoworkerDocument: deleteCoworkerDocumentMock,
  uploadCoworkerDocument: uploadCoworkerDocumentMock,
}));

import { coworkerRouter } from "./coworker";
const coworkerRouterAny = coworkerRouter as unknown as Record<
  string,
  (args: unknown) => Promise<unknown>
>;
const DEFAULT_MODEL = "openai/gpt-5.4";

function createContext() {
  const insertReturningMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const updateReturningMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  const deleteReturningMock = vi.fn();
  const deleteWhereMock = vi.fn(() => ({ returning: deleteReturningMock }));
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  const context = {
    user: { id: "user-1" },
    db: {
      query: {
        coworker: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        coworkerDocument: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        coworkerRun: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
        },
        coworkerRunEvent: {
          findMany: vi.fn(),
        },
        generation: {
          findFirst: vi.fn(),
        },
        conversation: {
          findFirst: vi.fn(),
        },
        user: {
          findFirst: vi.fn(),
        },
      },
      insert: insertMock,
      update: updateMock,
      delete: deleteMock,
    },
    mocks: {
      insertReturningMock,
      insertValuesMock,
      updateSetMock,
      updateReturningMock,
      deleteReturningMock,
    },
  };

  context.db.query.user.findFirst.mockResolvedValue({ role: "member" });
  context.db.query.coworkerDocument.findMany.mockResolvedValue([]);

  return context;
}

describe("coworkerRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateCoworkerMetadataOnFirstPromptFillMock.mockResolvedValue({});
    normalizeAndEnsureUniqueCoworkerUsernameMock.mockImplementation(
      async ({ username }: { username?: string | null }) => {
        const trimmed = username?.trim();
        return trimmed ? trimmed.toLowerCase().replace(/\s+/g, "-") : null;
      },
    );
    syncCoworkerScheduleJobMock.mockResolvedValue(undefined);
    removeCoworkerScheduleJobMock.mockResolvedValue(undefined);
    triggerCoworkerRunMock.mockResolvedValue({
      coworkerId: "wf-1",
      runId: "run-1",
      generationId: "gen-1",
      conversationId: "conv-1",
    });
    applyCoworkerEditMock.mockResolvedValue({
      status: "applied",
      coworker: {
        coworkerId: "wf-1",
        updatedAt: "2026-03-03T12:01:00.000Z",
        prompt: "updated",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
      },
      appliedChanges: ["prompt"],
    });
    uploadCoworkerDocumentMock.mockResolvedValue({
      id: "doc-1",
      filename: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
    });
    deleteCoworkerDocumentMock.mockResolvedValue({
      success: true,
      filename: "brief.pdf",
    });
  });

  it("creates a coworker and syncs schedule on happy path", async () => {
    const context = createContext();
    context.mocks.insertReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        name: "",
        description: null,
        username: null,
        status: "on",
        triggerType: "schedule",
      },
    ]);

    const result = await coworkerRouterAny.create({
      input: {
        triggerType: "schedule",
        prompt: "Daily task",
        model: DEFAULT_MODEL,
        autoApprove: true,
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: [],
        schedule: {
          type: "daily",
          time: "09:30",
          timezone: "UTC",
        },
      },
      context,
    });

    expect(result).toEqual({
      id: "wf-1",
      name: "",
      description: null,
      username: null,
      status: "on",
    });
    expect(syncCoworkerScheduleJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wf-1" }),
    );
  });

  it("lists coworkers with run summaries and source classification", async () => {
    const context = createContext();
    const now = new Date("2026-02-12T00:00:00.000Z");
    const startedAt = new Date("2026-02-11T09:30:00.000Z");
    const secondStartedAt = new Date("2026-02-10T09:30:00.000Z");

    context.db.query.coworker.findMany.mockResolvedValue([
      {
        id: "wf-1",
        name: "Daily Coworker",
        description: "Daily summary",
        username: "daily-coworker",
        status: "on",
        autoApprove: true,
        triggerType: "schedule",
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: [],
        schedule: { type: "daily", time: "09:30", timezone: "UTC" },
        updatedAt: now,
      },
      {
        id: "wf-2",
        name: "Manual Coworker",
        description: null,
        username: null,
        status: "off",
        autoApprove: false,
        triggerType: "manual",
        allowedIntegrations: ["github"],
        allowedCustomIntegrations: [],
        schedule: null,
        updatedAt: now,
      },
    ]);
    context.db.query.coworkerRun.findMany
      .mockResolvedValueOnce([
        {
          id: "run-1",
          status: "success",
          startedAt,
          generation: { conversationId: "conv-1" },
          triggerPayload: { event: "schedule" },
        },
        {
          id: "run-2",
          status: "failed",
          startedAt: secondStartedAt,
          generation: null,
          triggerPayload: {},
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await coworkerRouterAny.list({ context });

    expect(result).toEqual([
      {
        id: "wf-1",
        name: "Daily Coworker",
        description: "Daily summary",
        username: "daily-coworker",
        status: "on",
        autoApprove: true,
        toolAccessMode: "selected",
        allowedSkillSlugs: [],
        triggerType: "schedule",
        integrations: ["slack"],
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: [],
        schedule: { type: "daily", time: "09:30", timezone: "UTC" },
        updatedAt: now,
        lastRunStatus: "success",
        lastRunAt: startedAt,
        recentRuns: [
          {
            id: "run-1",
            status: "success",
            startedAt,
            conversationId: "conv-1",
            source: "trigger",
          },
          {
            id: "run-2",
            status: "failed",
            startedAt: secondStartedAt,
            conversationId: null,
            source: "manual",
          },
        ],
      },
      {
        id: "wf-2",
        name: "Manual Coworker",
        description: null,
        username: null,
        status: "off",
        autoApprove: false,
        toolAccessMode: "selected",
        allowedSkillSlugs: [],
        triggerType: "manual",
        integrations: ["github"],
        allowedIntegrations: ["github"],
        allowedCustomIntegrations: [],
        schedule: null,
        updatedAt: now,
        lastRunStatus: null,
        lastRunAt: null,
        recentRuns: [],
      },
    ]);
  });

  it("gets a coworker with mapped runs", async () => {
    const context = createContext();
    const now = new Date("2026-02-12T00:00:00.000Z");
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Coworker",
      description: "Summarizes things",
      username: "coworker",
      status: "on",
      autoApprove: true,
      toolAccessMode: "selected",
      allowedSkillSlugs: [],
      triggerType: "manual",
      prompt: "Prompt",
      promptDo: "Do this",
      promptDont: "Don't do this",
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
      createdAt: now,
      updatedAt: now,
    });
    context.db.query.coworkerRun.findMany.mockResolvedValue([
      {
        id: "run-1",
        status: "success",
        startedAt: now,
        finishedAt: now,
        errorMessage: null,
      },
    ]);

    const result = await coworkerRouterAny.get({
      input: { id: "wf-1" },
      context,
    });
    const getRunsArgs = context.db.query.coworkerRun.findMany.mock.calls[0]?.[0];
    const getRunsOrderBy = getRunsArgs.orderBy(
      { startedAt: "started-col" },
      { desc: (value: unknown) => `d:${value}` },
    );

    expect(result).toEqual({
      id: "wf-1",
      name: "Coworker",
      description: "Summarizes things",
      username: "coworker",
      status: "on",
      autoApprove: true,
      toolAccessMode: "selected",
      allowedSkillSlugs: [],
      triggerType: "manual",
      prompt: "Prompt",
      promptDo: "Do this",
      promptDont: "Don't do this",
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
      createdAt: now,
      updatedAt: now,
      documents: [],
      runs: [
        {
          id: "run-1",
          status: "success",
          startedAt: now,
          finishedAt: now,
          errorMessage: null,
        },
      ],
    });
    expect(getRunsOrderBy).toEqual(["d:started-col"]);
  });

  it("backfills missing builder metadata on get when prompt already exists", async () => {
    const context = createContext();
    const now = new Date("2026-03-12T10:00:00.000Z");
    generateCoworkerMetadataOnFirstPromptFillMock.mockResolvedValueOnce({
      description: "Summarizes the workflow.",
      username: "summary-sentence",
    });
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      builderConversationId: "conv-builder-1",
      name: "Builder Draft",
      description: null,
      username: null,
      status: "on",
      autoApprove: true,
      toolAccessMode: "all",
      allowedSkillSlugs: [],
      triggerType: "manual",
      prompt: "Summary sentence. another sentence",
      promptDo: null,
      promptDont: null,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
      createdAt: now,
      updatedAt: now,
    });
    context.mocks.updateReturningMock.mockResolvedValueOnce([
      {
        id: "wf-1",
        ownerId: "user-1",
        builderConversationId: "conv-builder-1",
        name: "Builder Draft",
        description: "Summarizes the workflow.",
        username: "summary-sentence",
        status: "on",
        autoApprove: true,
        toolAccessMode: "all",
        allowedSkillSlugs: [],
        triggerType: "manual",
        prompt: "Summary sentence. another sentence",
        promptDo: null,
        promptDont: null,
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: [],
        schedule: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    context.db.query.coworkerRun.findMany.mockResolvedValue([]);

    const result = await coworkerRouterAny.get({
      input: { id: "wf-1" },
      context,
    });

    expect(context.mocks.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Summarizes the workflow.",
        username: "summary-sentence",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        description: "Summarizes the workflow.",
        username: "summary-sentence",
      }),
    );
  });

  it("returns NOT_FOUND when getting a missing coworker", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue(null);

    await expect(
      coworkerRouterAny.get({
        input: { id: "wf-missing" },
        context,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("uploads a document for a coworker", async () => {
    const context = createContext();

    const result = await coworkerRouterAny.uploadDocument({
      input: {
        coworkerId: "wf-1",
        filename: "brief.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("test").toString("base64"),
        description: "Reference brief",
      },
      context,
    });

    expect(uploadCoworkerDocumentMock).toHaveBeenCalledWith({
      database: context.db,
      userId: "user-1",
      coworkerId: "wf-1",
      filename: "brief.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("test").toString("base64"),
      description: "Reference brief",
    });
    expect(result).toEqual({
      id: "doc-1",
      filename: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
    });
  });

  it("deletes a document for a coworker", async () => {
    const context = createContext();

    const result = await coworkerRouterAny.deleteDocument({
      input: { id: "doc-1" },
      context,
    });

    expect(deleteCoworkerDocumentMock).toHaveBeenCalledWith({
      database: context.db,
      userId: "user-1",
      documentId: "doc-1",
    });
    expect(result).toEqual({
      success: true,
      filename: "brief.pdf",
    });
  });

  it("uses provided coworker name without generation", async () => {
    const context = createContext();
    context.mocks.insertReturningMock.mockResolvedValue([
      {
        id: "wf-2",
        name: "Explicit Name",
        description: null,
        username: null,
        status: "on",
        triggerType: "manual",
      },
    ]);

    const result = await coworkerRouterAny.create({
      input: {
        name: "  Explicit Name  ",
        triggerType: "manual",
        prompt: "Prompt text",
        model: DEFAULT_MODEL,
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: [],
      },
      context,
    });

    expect(result).toEqual({
      id: "wf-2",
      name: "Explicit Name",
      description: null,
      username: null,
      status: "on",
    });
    expect(context.mocks.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Explicit Name" }),
    );
    expect(generateCoworkerMetadataOnFirstPromptFillMock).not.toHaveBeenCalled();
    expect(syncCoworkerScheduleJobMock).not.toHaveBeenCalled();
  });

  it("creates a coworker with blank metadata when no explicit values are provided", async () => {
    const context = createContext();
    context.mocks.insertReturningMock.mockResolvedValue([
      {
        id: "wf-3",
        name: "",
        description: null,
        username: null,
        status: "on",
        triggerType: "manual",
      },
    ]);

    const result = (await coworkerRouterAny.create({
      input: {
        triggerType: "manual",
        prompt: "First sentence for fallback. second sentence",
        model: DEFAULT_MODEL,
        autoApprove: true,
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: [],
      },
      context,
    })) as { name: string; description: string | null; username: string | null };

    expect(result).toEqual({
      id: "wf-3",
      name: "",
      description: null,
      username: null,
      status: "on",
    });
    expect(context.mocks.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "", description: null, username: null }),
    );
  });

  it("rejects admin-only Claude model on create for non-admin users", async () => {
    const context = createContext();

    await expect(
      coworkerRouterAny.create({
        input: {
          triggerType: "manual",
          prompt: "Prompt text",
          model: "anthropic/claude-sonnet-4-6",
          allowedIntegrations: ["slack"],
          allowedCustomIntegrations: [],
        },
        context,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Claude Sonnet 4.6 is only available to admins.",
    });
  });

  it("normalizes and persists explicit username and description on create", async () => {
    const context = createContext();
    context.mocks.insertReturningMock.mockResolvedValue([
      {
        id: "wf-4",
        name: "Coworker",
        description: "Handles follow-ups",
        username: "team-helper",
        status: "on",
        triggerType: "manual",
      },
    ]);

    await coworkerRouterAny.create({
      input: {
        name: "Coworker",
        description: "  Handles follow-ups  ",
        username: " Team Helper ",
        triggerType: "manual",
        prompt: "... \n!",
        model: DEFAULT_MODEL,
        autoApprove: true,
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: [],
      },
      context,
    });

    expect(context.mocks.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Coworker",
        description: "Handles follow-ups",
        username: "team-helper",
      }),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when schedule sync fails during create", async () => {
    const context = createContext();
    context.mocks.insertReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        name: "",
        description: null,
        username: null,
        status: "on",
        triggerType: "schedule",
      },
    ]);
    syncCoworkerScheduleJobMock.mockRejectedValue(new Error("scheduler down"));

    await expect(
      coworkerRouterAny.create({
        input: {
          triggerType: "schedule",
          prompt: "Daily task",
          model: DEFAULT_MODEL,
          autoApprove: true,
          allowedIntegrations: ["slack"],
          allowedCustomIntegrations: [],
          schedule: {
            type: "daily",
            time: "09:30",
            timezone: "UTC",
          },
        },
        context,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("updates a coworker on happy path", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Old Name",
      status: "on",
      triggerType: "manual",
      prompt: "Old prompt",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "off",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    const result = await coworkerRouterAny.update({
      input: {
        id: "wf-1",
        name: "Renamed Coworker",
        status: "off",
      },
      context,
    });

    expect(result).toEqual({ success: true });
  });

  it("returns NOT_FOUND when updating a missing coworker", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue(null);

    await expect(
      coworkerRouterAny.update({
        input: {
          id: "wf-missing",
          name: "Name",
        },
        context,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects admin-only Claude model on update for non-admin users", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Coworker",
      status: "on",
      triggerType: "manual",
      prompt: "Prompt",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
      model: DEFAULT_MODEL,
      authSource: "shared",
    });

    await expect(
      coworkerRouterAny.update({
        input: {
          id: "wf-1",
          model: "anthropic/claude-sonnet-4-6",
        },
        context,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Claude Sonnet 4.6 is only available to admins.",
    });
  });

  it("returns INTERNAL_SERVER_ERROR when schedule sync fails during update", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Coworker",
      status: "on",
      triggerType: "schedule",
      prompt: "Prompt",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: { type: "daily", time: "09:00", timezone: "UTC" },
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "on",
        triggerType: "schedule",
        schedule: { type: "daily", time: "09:00", timezone: "UTC" },
      },
    ]);
    syncCoworkerScheduleJobMock.mockRejectedValue(new Error("scheduler down"));

    await expect(
      coworkerRouterAny.update({
        input: {
          id: "wf-1",
          schedule: { type: "daily", time: "09:00", timezone: "UTC" },
        },
        context,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("returns NOT_FOUND when update returning payload is empty", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Coworker",
      status: "on",
      triggerType: "manual",
      prompt: "Prompt",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([]);

    await expect(
      coworkerRouterAny.update({
        input: { id: "wf-1", name: "Renamed" },
        context,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not sync scheduler when update changes only non-schedule fields", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Coworker",
      status: "on",
      triggerType: "manual",
      prompt: "Prompt",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "on",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    const result = await coworkerRouterAny.update({
      input: { id: "wf-1", name: "Renamed" },
      context,
    });

    expect(result).toEqual({ success: true });
    expect(syncCoworkerScheduleJobMock).not.toHaveBeenCalled();
  });

  it("updates allowed integration fields when provided", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Coworker",
      status: "on",
      triggerType: "manual",
      prompt: "Prompt",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "on",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    await coworkerRouterAny.update({
      input: {
        id: "wf-1",
        allowedIntegrations: ["github", "slack"],
        allowedCustomIntegrations: ["custom-1"],
      },
      context,
    });

    expect(context.mocks.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedIntegrations: ["github", "slack"],
        allowedCustomIntegrations: ["custom-1"],
      }),
    );
  });

  it("sets empty coworker name when updating with blank name and blank prompt", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Coworker",
      status: "on",
      triggerType: "manual",
      prompt: "   ",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "on",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    await coworkerRouterAny.update({
      input: { id: "wf-1", name: "   " },
      context,
    });

    expect(context.mocks.updateSetMock).toHaveBeenCalledWith(expect.objectContaining({ name: "" }));
  });

  it("fills missing metadata on first prompt transition from blank to non-blank", async () => {
    const context = createContext();
    generateCoworkerMetadataOnFirstPromptFillMock.mockResolvedValueOnce({
      name: "Summary sentence",
      description: "Summarizes the workflow.",
      username: "summary-sentence",
    });
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "",
      description: null,
      username: null,
      status: "on",
      triggerType: "manual",
      prompt: "   ",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "on",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    await coworkerRouterAny.update({
      input: {
        id: "wf-1",
        prompt: "Summary sentence. another sentence",
      },
      context,
    });

    expect(context.mocks.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Summary sentence. another sentence",
        name: "Summary sentence",
        description: "Summarizes the workflow.",
        username: "summary-sentence",
      }),
    );
  });

  it("preserves explicit name on first prompt transition while filling other metadata", async () => {
    const context = createContext();
    generateCoworkerMetadataOnFirstPromptFillMock.mockResolvedValueOnce({
      description: "Summarizes the workflow.",
      username: "explicit-name",
    });
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "",
      description: null,
      username: null,
      status: "on",
      triggerType: "manual",
      prompt: "   ",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "on",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    await coworkerRouterAny.update({
      input: { id: "wf-1", name: "Explicit Name", prompt: "... \n!" },
      context,
    });

    expect(context.mocks.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Explicit Name",
        description: "Summarizes the workflow.",
        username: "explicit-name",
      }),
    );
  });

  it("does not generate metadata after the prompt was already non-empty", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Existing",
      description: "Existing description",
      username: "existing",
      status: "on",
      triggerType: "manual",
      prompt: "Original prompt",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "on",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    await coworkerRouterAny.update({
      input: { id: "wf-1", prompt: "Updated prompt" },
      context,
    });

    expect(generateCoworkerMetadataOnFirstPromptFillMock).toHaveBeenCalled();
    expect(context.mocks.updateSetMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        name: expect.any(String),
        description: expect.any(String),
        username: expect.any(String),
      }),
    );
  });

  it("normalizes manual username edits before persisting", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      name: "Existing",
      description: null,
      username: null,
      status: "on",
      triggerType: "manual",
      prompt: "Original prompt",
      promptDo: null,
      promptDont: null,
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
    });
    context.mocks.updateReturningMock.mockResolvedValue([
      {
        id: "wf-1",
        status: "on",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    await coworkerRouterAny.update({
      input: { id: "wf-1", username: " Team Helper " },
      context,
    });

    expect(normalizeAndEnsureUniqueCoworkerUsernameMock).toHaveBeenCalledWith({
      database: context.db,
      coworkerId: "wf-1",
      username: "Team Helper",
    });
    expect(context.mocks.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ username: "team-helper" }),
    );
  });

  it("deletes a coworker on happy path", async () => {
    const context = createContext();
    context.mocks.deleteReturningMock.mockResolvedValue([{ id: "wf-1" }]);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Router procedure call, not a Drizzle query
    const result = await coworkerRouterAny.delete({
      input: { id: "wf-1" },
      context,
    });

    expect(result).toEqual({ success: true });
    expect(removeCoworkerScheduleJobMock).toHaveBeenCalledWith("wf-1");
  });

  it("returns NOT_FOUND when deleting a missing coworker", async () => {
    const context = createContext();
    context.mocks.deleteReturningMock.mockResolvedValue([]);

    await expect(
      // eslint-disable-next-line drizzle/enforce-delete-with-where -- Router procedure call, not a Drizzle query
      coworkerRouterAny.delete({
        input: { id: "wf-missing" },
        context,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates builder conversations with auto-approve disabled", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Coworker",
      builderConversationId: null,
    });
    context.mocks.insertReturningMock.mockResolvedValue([{ id: "conv-builder-1" }]);

    const result = await coworkerRouterAny.getOrCreateBuilderConversation({
      input: { id: "wf-1" },
      context,
    });

    expect(result).toEqual({ conversationId: "conv-builder-1" });
    expect(context.mocks.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "coworker",
        autoApprove: false,
      }),
    );
  });

  it("forces existing builder conversations to disable auto-approve", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Coworker",
      builderConversationId: "conv-builder-1",
    });
    context.db.query.conversation.findFirst.mockResolvedValue({
      id: "conv-builder-1",
      autoApprove: true,
    });

    const result = await coworkerRouterAny.getOrCreateBuilderConversation({
      input: { id: "wf-1" },
      context,
    });

    expect(result).toEqual({ conversationId: "conv-builder-1" });
    expect(context.mocks.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ autoApprove: false }),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when scheduler cleanup fails during delete", async () => {
    const context = createContext();
    context.mocks.deleteReturningMock.mockResolvedValue([{ id: "wf-1" }]);
    removeCoworkerScheduleJobMock.mockRejectedValueOnce(new Error("queue unavailable"));

    await expect(
      // eslint-disable-next-line drizzle/enforce-delete-with-where -- Router procedure call, not a Drizzle query
      coworkerRouterAny.delete({
        input: { id: "wf-1" },
        context,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("forwards trigger payload and user role to triggerCoworkerRun", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue({ role: "admin" });

    const result = await coworkerRouterAny.trigger({
      input: { id: "wf-1", payload: { source: "manual" } },
      context,
    });

    expect(result).toEqual({
      coworkerId: "wf-1",
      runId: "run-1",
      generationId: "gen-1",
      conversationId: "conv-1",
    });

    expect(triggerCoworkerRunMock).toHaveBeenCalledWith({
      coworkerId: "wf-1",
      triggerPayload: { source: "manual" },
      userId: "user-1",
      userRole: "admin",
    });
  });

  it("defaults trigger payload to empty object when omitted", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue(null);

    await coworkerRouterAny.trigger({
      input: { id: "wf-1" },
      context,
    });

    expect(triggerCoworkerRunMock).toHaveBeenCalledWith({
      coworkerId: "wf-1",
      triggerPayload: {},
      userId: "user-1",
      userRole: null,
    });
  });

  it("applies coworker builder edits with user role context", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue({ role: "admin" });

    const result = await coworkerRouterAny.edit({
      input: {
        coworkerId: "wf-1",
        baseUpdatedAt: "2026-03-03T12:00:00.000Z",
        changes: { prompt: "new prompt" },
      },
      context,
    });

    expect(result).toEqual({
      status: "applied",
      coworker: {
        coworkerId: "wf-1",
        updatedAt: "2026-03-03T12:01:00.000Z",
        prompt: "updated",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
      },
      appliedChanges: ["prompt"],
    });
    expect(applyCoworkerEditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userRole: "admin",
        coworkerId: "wf-1",
      }),
    );
  });

  it("returns NOT_FOUND when getting a missing run", async () => {
    const context = createContext();
    context.db.query.coworkerRun.findFirst.mockResolvedValue(null);

    await expect(
      coworkerRouterAny.getRun({
        input: { id: "run-missing" },
        context,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when run exists but coworker is not accessible", async () => {
    const context = createContext();
    context.db.query.coworkerRun.findFirst.mockResolvedValue({
      id: "run-1",
      coworkerId: "wf-1",
      status: "success",
      triggerPayload: {},
      generationId: null,
      startedAt: new Date("2026-02-12T00:00:00.000Z"),
      finishedAt: null,
      errorMessage: null,
    });
    context.db.query.coworker.findFirst.mockResolvedValue(null);

    await expect(
      coworkerRouterAny.getRun({
        input: { id: "run-1" },
        context,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gets run details with ordered events and conversation id", async () => {
    const context = createContext();
    const createdAt = new Date("2026-02-12T00:00:00.000Z");
    context.db.query.coworkerRun.findFirst.mockResolvedValue({
      id: "run-1",
      coworkerId: "wf-1",
      status: "success",
      triggerPayload: { source: "schedule" },
      generationId: "gen-1",
      startedAt: createdAt,
      finishedAt: createdAt,
      errorMessage: null,
    });
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Inbox Triage",
      username: "inbox-triage",
      ownerId: "user-1",
    });
    context.db.query.coworkerRunEvent.findMany.mockResolvedValue([
      {
        id: "evt-1",
        type: "started",
        payload: { ok: true },
        createdAt,
      },
    ]);
    context.db.query.generation.findFirst.mockResolvedValue({
      conversationId: "conv-1",
    });

    const result = await coworkerRouterAny.getRun({
      input: { id: "run-1" },
      context,
    });
    const eventArgs = context.db.query.coworkerRunEvent.findMany.mock.calls[0]?.[0];
    const eventsOrderBy = eventArgs.orderBy(
      { createdAt: "created-col" },
      { asc: (value: unknown) => `a:${value}` },
    );

    expect(result).toEqual({
      id: "run-1",
      coworkerId: "wf-1",
      coworkerName: "Inbox Triage",
      coworkerUsername: "inbox-triage",
      status: "success",
      triggerPayload: { source: "schedule" },
      generationId: "gen-1",
      conversationId: "conv-1",
      startedAt: createdAt,
      finishedAt: createdAt,
      errorMessage: null,
      events: [
        {
          id: "evt-1",
          type: "started",
          payload: { ok: true },
          createdAt,
        },
      ],
    });
    expect(eventsOrderBy).toEqual(["a:created-col"]);
  });

  it("sets null conversation id when run has no generation", async () => {
    const context = createContext();
    context.db.query.coworkerRun.findFirst.mockResolvedValue({
      id: "run-2",
      coworkerId: "wf-1",
      status: "success",
      triggerPayload: {},
      generationId: null,
      startedAt: new Date("2026-02-12T00:00:00.000Z"),
      finishedAt: null,
      errorMessage: null,
    });
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Inbox Triage",
      username: null,
      ownerId: "user-1",
    });
    context.db.query.coworkerRunEvent.findMany.mockResolvedValue([]);

    const result = (await coworkerRouterAny.getRun({
      input: { id: "run-2" },
      context,
    })) as { conversationId: string | null };

    expect(result.conversationId).toBeNull();
    expect(result).toMatchObject({
      coworkerName: "Inbox Triage",
      coworkerUsername: null,
    });
    expect(context.db.query.generation.findFirst).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when listing runs for missing coworker", async () => {
    const context = createContext();
    context.db.query.coworker.findFirst.mockResolvedValue(null);

    await expect(
      coworkerRouterAny.listRuns({
        input: { coworkerId: "wf-missing", limit: 10 },
        context,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists coworker runs with public fields", async () => {
    const context = createContext();
    const now = new Date("2026-02-12T00:00:00.000Z");
    context.db.query.coworker.findFirst.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
    });
    context.db.query.coworkerRun.findMany.mockResolvedValue([
      {
        id: "run-1",
        status: "success",
        startedAt: now,
        finishedAt: now,
        errorMessage: null,
      },
    ]);

    const result = await coworkerRouterAny.listRuns({
      input: { coworkerId: "wf-1", limit: 10 },
      context,
    });
    const listRunsArgs = context.db.query.coworkerRun.findMany.mock.calls[0]?.[0];
    const listRunsOrderBy = listRunsArgs.orderBy(
      { startedAt: "started-col" },
      { desc: (value: unknown) => `d:${value}` },
    );

    expect(result).toEqual([
      {
        id: "run-1",
        status: "success",
        startedAt: now,
        finishedAt: now,
        errorMessage: null,
      },
    ]);
    expect(listRunsOrderBy).toEqual(["d:started-col"]);
  });
});
