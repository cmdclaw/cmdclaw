import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authorizeRuntimeTurnMock = vi.fn();
const uploadCoworkerDocumentMock = vi.fn();

vi.mock("../../../../runtime/_auth", () => ({
  authorizeRuntimeTurn: authorizeRuntimeTurnMock,
}));

vi.mock("@/server/services/coworker-document", () => ({
  uploadCoworkerDocument: uploadCoworkerDocumentMock,
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {},
}));

let POST: typeof import("./route").POST;

describe("POST /api/internal/coworkers/runtime/documents/upload", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authorizeRuntimeTurnMock.mockResolvedValue({
      ok: true,
      runtimeId: "rt-1",
      turnSeq: 2,
      userId: "user-1",
    });
    uploadCoworkerDocumentMock.mockResolvedValue({
      id: "doc-1",
      filename: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 12,
    });
  });

  it("uploads a coworker document for later runs", async () => {
    const request = new Request(
      "https://app.example.com/api/internal/coworkers/runtime/documents/upload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer runtime-token",
        },
        body: JSON.stringify({
          runtimeId: "rt-1",
          turnSeq: 2,
          coworkerId: "cw-1",
          filename: "brief.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("hello world").toString("base64"),
          description: "Reference brief",
        }),
      },
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(uploadCoworkerDocumentMock).toHaveBeenCalledWith({
      database: expect.anything(),
      userId: "user-1",
      coworkerId: "cw-1",
      filename: "brief.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("hello world").toString("base64"),
      description: "Reference brief",
    });
    expect(body).toEqual({
      document: {
        id: "doc-1",
        filename: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
      },
    });
  });

  it("returns stale_turn for an older runtime callback", async () => {
    authorizeRuntimeTurnMock.mockResolvedValue({
      ok: false,
      reason: "stale_turn",
    });

    const request = new Request(
      "https://app.example.com/api/internal/coworkers/runtime/documents/upload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer runtime-token",
        },
        body: JSON.stringify({
          runtimeId: "rt-1",
          turnSeq: 1,
          coworkerId: "cw-1",
          filename: "brief.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("hello world").toString("base64"),
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "stale_turn" });
    expect(uploadCoworkerDocumentMock).not.toHaveBeenCalled();
  });
});
