import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authorizeRuntimeTurnMock = vi.fn();
const resolveCoworkerBuilderContextByConversationMock = vi.fn();
const applyCoworkerEditMock = vi.fn();
const userFindFirstMock = vi.fn();

vi.mock("../../../runtime/_auth", () => ({
  authorizeRuntimeTurn: authorizeRuntimeTurnMock,
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    query: {
      user: {
        findFirst: userFindFirstMock,
      },
    },
  },
}));

vi.mock("@cmdclaw/core/server/services/coworker-builder-service", async () => {
  const actual = await vi.importActual<
    typeof import("@cmdclaw/core/server/services/coworker-builder-service")
  >("@cmdclaw/core/server/services/coworker-builder-service");
  return {
    ...actual,
    resolveCoworkerBuilderContextByConversation: resolveCoworkerBuilderContextByConversationMock,
    applyCoworkerEdit: applyCoworkerEditMock,
  };
});

let POST: typeof import("./route").POST;

describe("POST /api/internal/coworkers/runtime/edit", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authorizeRuntimeTurnMock.mockResolvedValue({
      ok: true,
      runtimeId: "rt-1",
      turnSeq: 2,
      generationId: "gen-1",
      conversationId: "conv-builder",
      userId: "user-1",
    });
    userFindFirstMock.mockResolvedValue({ role: "admin" });
    resolveCoworkerBuilderContextByConversationMock.mockResolvedValue({
      coworkerId: "cw-1",
      updatedAt: "2026-03-03T12:00:00.000Z",
      prompt: "Current prompt",
      model: "openai/gpt-5.4",
      toolAccessMode: "selected",
      triggerType: "manual",
      schedule: null,
      allowedIntegrations: ["github"],
    });
    applyCoworkerEditMock.mockResolvedValue({
      status: "applied",
      appliedChanges: ["prompt"],
      coworker: {
        coworkerId: "cw-1",
        updatedAt: "2026-03-03T12:01:00.000Z",
        prompt: "Updated prompt",
        model: "openai/gpt-5.4",
        toolAccessMode: "selected",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
      },
    });
  });

  it("applies coworker edits for the active builder conversation", async () => {
    const request = new Request("https://app.example.com/api/internal/coworkers/runtime/edit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-token",
      },
      body: JSON.stringify({
        runtimeId: "rt-1",
        turnSeq: 2,
        coworkerId: "cw-1",
        baseUpdatedAt: "2026-03-03T12:00:00.000Z",
        changes: { prompt: "Updated prompt" },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(applyCoworkerEditMock).toHaveBeenCalledWith({
      database: expect.anything(),
      userId: "user-1",
      userRole: "admin",
      coworkerId: "cw-1",
      baseUpdatedAt: "2026-03-03T12:00:00.000Z",
      changes: { prompt: "Updated prompt" },
    });
    expect(body).toEqual({
      edit: {
        kind: "coworker_edit_apply",
        status: "applied",
        coworkerId: "cw-1",
        appliedChanges: ["prompt"],
        coworker: {
          coworkerId: "cw-1",
          updatedAt: "2026-03-03T12:01:00.000Z",
          prompt: "Updated prompt",
          model: "openai/gpt-5.4",
          toolAccessMode: "selected",
          triggerType: "manual",
          schedule: null,
          allowedIntegrations: ["github"],
        },
        message: "Saved coworker edits: prompt.",
      },
    });
  });

  it("returns stale_turn for out-of-date runtime callbacks", async () => {
    authorizeRuntimeTurnMock.mockResolvedValue({
      ok: false,
      reason: "stale_turn",
    });

    const request = new Request("https://app.example.com/api/internal/coworkers/runtime/edit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-token",
      },
      body: JSON.stringify({
        runtimeId: "rt-1",
        turnSeq: 1,
        coworkerId: "cw-1",
        baseUpdatedAt: "2026-03-03T12:00:00.000Z",
        changes: { prompt: "Updated prompt" },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "stale_turn" });
    expect(applyCoworkerEditMock).not.toHaveBeenCalled();
  });
});
