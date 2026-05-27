import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  coworkerDocumentFindFirstMock,
  coworkerFindFirstMock,
  downloadFromS3Mock,
  requireActiveWorkspaceAccessMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  coworkerDocumentFindFirstMock: vi.fn(),
  coworkerFindFirstMock: vi.fn(),
  downloadFromS3Mock: vi.fn(),
  requireActiveWorkspaceAccessMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    query: {
      coworkerDocument: {
        findFirst: coworkerDocumentFindFirstMock,
      },
      coworker: {
        findFirst: coworkerFindFirstMock,
      },
    },
  },
}));

vi.mock("@cmdclaw/core/server/storage/s3-client", () => ({
  downloadFromS3: downloadFromS3Mock,
}));

vi.mock("@/server/orpc/workspace-access", () => ({
  requireActiveWorkspaceAccess: requireActiveWorkspaceAccessMock,
}));

import { GET } from "./route";

describe("GET /api/coworkers/documents/[id]/download", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    coworkerDocumentFindFirstMock.mockReset();
    coworkerFindFirstMock.mockReset();
    downloadFromS3Mock.mockReset();
    requireActiveWorkspaceAccessMock.mockReset();
  });

  it("streams an owned coworker document through the app", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    requireActiveWorkspaceAccessMock.mockResolvedValue({ workspace: { id: "workspace-1" } });
    coworkerDocumentFindFirstMock.mockResolvedValue({
      coworkerId: "cw-1",
      filename: "need-more-info.png",
      mimeType: "image/png",
      storageKey: "coworkers/user-1/cw-1/documents/need-more-info.png",
    });
    coworkerFindFirstMock.mockResolvedValue({ id: "cw-1" });
    downloadFromS3Mock.mockResolvedValue(Buffer.from("png-bytes"));

    const response = await GET(new Request("https://cmdclaw.ai/api/download"), {
      params: Promise.resolve({ id: "doc-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"need-more-info.png\"; filename*=UTF-8''need-more-info.png",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("png-bytes");
    expect(downloadFromS3Mock).toHaveBeenCalledWith(
      "coworkers/user-1/cw-1/documents/need-more-info.png",
    );
  });

  it("rejects unauthenticated requests", async () => {
    getSessionMock.mockResolvedValue(null);

    const response = await GET(new Request("https://cmdclaw.ai/api/download"), {
      params: Promise.resolve({ id: "doc-1" }),
    });

    expect(response.status).toBe(401);
    expect(downloadFromS3Mock).not.toHaveBeenCalled();
  });

  it("does not download documents for coworkers outside the active workspace", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    requireActiveWorkspaceAccessMock.mockResolvedValue({ workspace: { id: "workspace-1" } });
    coworkerDocumentFindFirstMock.mockResolvedValue({
      coworkerId: "cw-1",
      filename: "brief.pdf",
      mimeType: "application/pdf",
      storageKey: "coworkers/user-1/cw-1/documents/brief.pdf",
    });
    coworkerFindFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("https://cmdclaw.ai/api/download"), {
      params: Promise.resolve({ id: "doc-1" }),
    });

    expect(response.status).toBe(404);
    expect(downloadFromS3Mock).not.toHaveBeenCalled();
  });
});
