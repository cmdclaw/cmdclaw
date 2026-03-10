import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  coworkerFindFirstMock,
  coworkerRunFindManyMock,
  coworkerRunFindFirstMock,
  providerAuthFindFirstMock,
  insertValuesMock,
  updateWhereMock,
  updateSetMock,
  dbMock,
  startCoworkerGenerationMock,
  resolveDefaultOpencodeFreeModelMock,
} = vi.hoisted(() => {
  const coworkerFindFirstMock = vi.fn();
  const coworkerRunFindManyMock = vi.fn();
  const coworkerRunFindFirstMock = vi.fn();
  const providerAuthFindFirstMock = vi.fn();

  const insertValuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  const dbMock = {
    query: {
      coworker: {
        findFirst: coworkerFindFirstMock,
      },
      coworkerRun: {
        findMany: coworkerRunFindManyMock,
        findFirst: coworkerRunFindFirstMock,
      },
      providerAuth: {
        findFirst: providerAuthFindFirstMock,
      },
    },
    insert: insertMock,
    update: updateMock,
  };

  const startCoworkerGenerationMock = vi.fn();
  const resolveDefaultOpencodeFreeModelMock = vi.fn();

  return {
    coworkerFindFirstMock,
    coworkerRunFindManyMock,
    coworkerRunFindFirstMock,
    providerAuthFindFirstMock,
    insertValuesMock,
    updateWhereMock,
    updateSetMock,
    dbMock,
    startCoworkerGenerationMock,
    resolveDefaultOpencodeFreeModelMock,
  };
});

vi.mock("@/server/db/client", () => ({
  db: dbMock,
}));

vi.mock("@cmdclaw/core/server/services/generation-manager", () => ({
  generationManager: {
    startCoworkerGeneration: startCoworkerGenerationMock,
  },
}));

vi.mock("@cmdclaw/core/server/ai/opencode-models", () => ({
  resolveDefaultOpencodeFreeModel: resolveDefaultOpencodeFreeModelMock,
}));

import { triggerCoworkerRun } from "@cmdclaw/core/server/services/coworker-service";

describe("triggerCoworkerRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-12T12:00:00.000Z"));
    vi.clearAllMocks();

    coworkerFindFirstMock.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      status: "on",
      autoApprove: true,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: ["custom-crm"],
      prompt: "Do the coworker",
      promptDo: "Do this",
      promptDont: "Do not do that",
    });

    coworkerRunFindManyMock.mockResolvedValue([]);
    coworkerRunFindFirstMock.mockResolvedValue(null);
    providerAuthFindFirstMock.mockResolvedValue(null);

    insertValuesMock.mockImplementation((values: unknown) => ({
      returning: vi.fn().mockResolvedValue([
        {
          id: "run-1",
          coworkerId: "wf-1",
          status: "running",
          startedAt: new Date("2026-02-12T12:00:00.000Z"),
          triggerPayload: values,
        },
      ]),
    }));

    updateWhereMock.mockResolvedValue(undefined);

    startCoworkerGenerationMock.mockResolvedValue({
      generationId: "gen-1",
      conversationId: "conv-1",
    });

    resolveDefaultOpencodeFreeModelMock.mockImplementation((override?: string) =>
      Promise.resolve(override ?? "opencode/glm-5-free"),
    );
  });

  it("throws NOT_FOUND when coworker is missing", async () => {
    coworkerFindFirstMock.mockResolvedValue(null);

    await expect(
      triggerCoworkerRun({ coworkerId: "missing", triggerPayload: {} }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when coworker is turned off", async () => {
    coworkerFindFirstMock.mockResolvedValue({
      id: "wf-1",
      ownerId: "user-1",
      status: "off",
      autoApprove: true,
      allowedIntegrations: [],
      allowedCustomIntegrations: [],
      prompt: "",
      promptDo: null,
      promptDont: null,
    });

    await expect(
      triggerCoworkerRun({ coworkerId: "wf-1", triggerPayload: {} }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("blocks non-admin users when an active run exists", async () => {
    coworkerRunFindFirstMock.mockResolvedValue({
      id: "run-active",
      status: "running",
      startedAt: new Date(),
    });

    await expect(
      triggerCoworkerRun({
        coworkerId: "wf-1",
        triggerPayload: { source: "manual" },
        userId: "user-1",
        userRole: "member",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows admin users to trigger despite an active run", async () => {
    coworkerRunFindFirstMock.mockResolvedValue({
      id: "run-active",
      status: "running",
      startedAt: new Date(),
    });

    const result = await triggerCoworkerRun({
      coworkerId: "wf-1",
      triggerPayload: { source: "manual" },
      userId: "user-1",
      userRole: "admin",
    });

    expect(result).toEqual({
      coworkerId: "wf-1",
      runId: "run-1",
      generationId: "gen-1",
      conversationId: "conv-1",
    });

    expect(startCoworkerGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        coworkerRunId: "run-1",
        model: "opencode/glm-5-free",
        userId: "user-1",
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: ["custom-crm"],
      }),
    );
  });

  it("prefers OpenAI default model when OpenAI is connected", async () => {
    providerAuthFindFirstMock.mockResolvedValue({ id: "auth-1" });

    await triggerCoworkerRun({
      coworkerId: "wf-1",
      triggerPayload: { source: "manual" },
      userId: "user-1",
      userRole: "admin",
    });

    expect(startCoworkerGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5.2-codex",
      }),
    );
    expect(resolveDefaultOpencodeFreeModelMock).not.toHaveBeenCalled();
  });

  it("uses CMDCLAW_CHAT_MODEL override when configured", async () => {
    const previous = process.env.CMDCLAW_CHAT_MODEL;
    process.env.CMDCLAW_CHAT_MODEL = "openai/gpt-4.1-mini";
    providerAuthFindFirstMock.mockResolvedValue({ id: "auth-1" });
    resolveDefaultOpencodeFreeModelMock.mockResolvedValue("openai/gpt-4.1-mini");

    try {
      await triggerCoworkerRun({
        coworkerId: "wf-1",
        triggerPayload: { source: "manual" },
        userId: "user-1",
        userRole: "admin",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.CMDCLAW_CHAT_MODEL;
      } else {
        process.env.CMDCLAW_CHAT_MODEL = previous;
      }
    }

    expect(resolveDefaultOpencodeFreeModelMock).toHaveBeenCalledWith("openai/gpt-4.1-mini");
    expect(startCoworkerGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-4.1-mini",
      }),
    );
  });

  it("marks the run as error and records an error event when generation start fails", async () => {
    startCoworkerGenerationMock.mockRejectedValue(new Error("start failed"));

    await expect(
      triggerCoworkerRun({
        coworkerId: "wf-1",
        triggerPayload: { source: "manual" },
        userId: "user-1",
        userRole: "admin",
      }),
    ).rejects.toThrow("start failed");

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorMessage: "start failed",
      }),
    );

    const errorEventCall = insertValuesMock.mock.calls.find(
      (call) =>
        call[0] &&
        typeof call[0] === "object" &&
        "type" in (call[0] as Record<string, unknown>) &&
        (call[0] as Record<string, unknown>).type === "error",
    );

    expect(errorEventCall?.[0]).toEqual(
      expect.objectContaining({
        coworkerRunId: "run-1",
        type: "error",
        payload: expect.objectContaining({ stage: "start_generation" }),
      }),
    );
  });

  it("reconciles stale orphan and terminal runs before starting a new run", async () => {
    coworkerRunFindManyMock.mockResolvedValue([
      {
        id: "run-orphan",
        status: "running",
        startedAt: new Date(Date.now() - 3 * 60 * 1000),
        finishedAt: null,
        errorMessage: null,
        generation: null,
      },
      {
        id: "run-terminal",
        status: "awaiting_approval",
        startedAt: new Date(Date.now() - 60 * 1000),
        finishedAt: null,
        errorMessage: null,
        generation: {
          id: "gen-terminal",
          conversationId: "conv-terminal",
          status: "completed",
          startedAt: new Date(Date.now() - 120 * 1000),
          completedAt: new Date(Date.now() - 30 * 1000),
          contentParts: [],
          pendingApproval: null,
          pendingAuth: null,
          errorMessage: null,
        },
      },
    ]);

    await triggerCoworkerRun({
      coworkerId: "wf-1",
      triggerPayload: { source: "scheduler" },
      userId: "user-1",
      userRole: "admin",
    });

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorMessage: "Coworker run failed before generation could start.",
      }),
    );

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
      }),
    );
  });
});
