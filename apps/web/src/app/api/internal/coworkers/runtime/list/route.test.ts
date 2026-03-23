import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authorizeRuntimeTurnMock = vi.fn();
const coworkerFindManyMock = vi.fn();

vi.mock("../../../runtime/_auth", () => ({
  authorizeRuntimeTurn: authorizeRuntimeTurnMock,
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    query: {
      coworker: {
        findMany: coworkerFindManyMock,
      },
    },
  },
}));

let POST: typeof import("./route").POST;

describe("POST /api/internal/coworkers/runtime/list", () => {
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
      conversationId: "conv-1",
      userId: "user-1",
    });
    coworkerFindManyMock.mockResolvedValue([
      {
        id: "cw-1",
        name: "LinkedIn Digest",
        username: "linkedin-digest",
        description: "Reviews LinkedIn inbox items",
        triggerType: "manual",
      },
      {
        id: "cw-2",
        name: "Hidden",
        username: null,
        description: null,
        triggerType: "manual",
      },
    ]);
  });

  it("returns invokable coworkers for the current runtime user", async () => {
    const request = new Request("https://app.example.com/api/internal/coworkers/runtime/list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-token",
      },
      body: JSON.stringify({
        runtimeId: "rt-1",
        turnSeq: 2,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      coworkers: [
        {
          id: "cw-1",
          name: "LinkedIn Digest",
          username: "linkedin-digest",
          description: "Reviews LinkedIn inbox items",
          triggerType: "manual",
        },
      ],
    });
  });

  it("returns stale_turn when the runtime binding is out of date", async () => {
    authorizeRuntimeTurnMock.mockResolvedValue({
      ok: false,
      reason: "stale_turn",
    });

    const request = new Request("https://app.example.com/api/internal/coworkers/runtime/list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-token",
      },
      body: JSON.stringify({
        runtimeId: "rt-1",
        turnSeq: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "stale_turn" });
  });
});
