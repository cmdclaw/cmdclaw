import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authorizeRuntimeTurnMock = vi.fn();
const coworkerFindFirstMock = vi.fn();
const coworkerFindManyMock = vi.fn();
const triggerCoworkerRunMock = vi.fn();

vi.mock("../../../runtime/_auth", () => ({
  authorizeRuntimeTurn: authorizeRuntimeTurnMock,
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    query: {
      coworker: {
        findFirst: coworkerFindFirstMock,
        findMany: coworkerFindManyMock,
      },
    },
  },
}));

vi.mock("@cmdclaw/core/server/services/coworker-service", () => ({
  triggerCoworkerRun: triggerCoworkerRunMock,
}));

vi.mock("@cmdclaw/core/server/services/coworker-metadata", () => ({
  normalizeCoworkerUsername: (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/^@+/, "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, ""),
}));

let POST: typeof import("./route").POST;

describe("POST /api/internal/coworkers/runtime/invoke", () => {
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
    coworkerFindFirstMock.mockResolvedValue({
      id: "cw-1",
      name: "LinkedIn Digest",
      username: "linkedin-digest",
    });
    coworkerFindManyMock.mockResolvedValue([]);
    triggerCoworkerRunMock.mockResolvedValue({
      coworkerId: "cw-1",
      runId: "run-1",
      generationId: "child-gen-1",
      conversationId: "child-conv-1",
    });
  });

  it("invokes a coworker with chat-origin payload and forwarded attachments", async () => {
    const request = new Request("https://app.example.com/api/internal/coworkers/runtime/invoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-token",
      },
      body: JSON.stringify({
        runtimeId: "rt-1",
        turnSeq: 2,
        username: "@linkedin-digest",
        message: "Review these LinkedIn messages",
        attachments: [
          {
            name: "voice-note.m4a",
            mimeType: "audio/mp4",
            dataUrl: "data:audio/mp4;base64,ZmFrZQ==",
          },
        ],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(triggerCoworkerRunMock).toHaveBeenCalledWith({
      coworkerId: "cw-1",
      userId: "user-1",
      triggerPayload: {
        source: "chat_mention",
        parentGenerationId: "gen-1",
        parentConversationId: "conv-1",
        mention: "@linkedin-digest",
        message: "Review these LinkedIn messages",
        attachmentNames: ["voice-note.m4a"],
      },
      fileAttachments: [
        {
          name: "voice-note.m4a",
          mimeType: "audio/mp4",
          dataUrl: "data:audio/mp4;base64,ZmFrZQ==",
        },
      ],
    });
    expect(body).toEqual({
      invocation: {
        kind: "coworker_invocation",
        coworkerId: "cw-1",
        username: "linkedin-digest",
        name: "LinkedIn Digest",
        runId: "run-1",
        conversationId: "child-conv-1",
        generationId: "child-gen-1",
        status: "running",
        attachmentNames: ["voice-note.m4a"],
        message: "Review these LinkedIn messages",
      },
    });
  });

  it("returns stale_turn when the runtime callback is for an older turn", async () => {
    authorizeRuntimeTurnMock.mockResolvedValue({
      ok: false,
      reason: "stale_turn",
    });

    const request = new Request("https://app.example.com/api/internal/coworkers/runtime/invoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer runtime-token",
      },
      body: JSON.stringify({
        runtimeId: "rt-1",
        turnSeq: 1,
        username: "@linkedin-digest",
        message: "Review these LinkedIn messages",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "stale_turn" });
    expect(triggerCoworkerRunMock).not.toHaveBeenCalled();
  });
});
