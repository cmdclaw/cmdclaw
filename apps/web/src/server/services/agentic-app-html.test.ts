import { beforeEach, describe, expect, it, vi } from "vitest";

type VitestProcedure = Extract<
  NonNullable<Parameters<typeof vi.fn>[0]>,
  (...args: never[]) => unknown
>;
import { loadAgenticAppHtml, AGENTIC_APP_MAX_BYTES, AgenticAppHtmlError } from "./agentic-app-html";

const { downloadFromS3Mock } = vi.hoisted(() => ({
  downloadFromS3Mock: vi.fn<VitestProcedure>(),
}));

vi.mock("@bap/core/server/storage/s3-client", () => ({
  downloadFromS3: downloadFromS3Mock,
}));

function previewFile(overrides?: {
  filename?: string;
  mimeType?: string | null;
  storageKey?: string | null;
  sizeBytes?: number | null;
  userId?: string | null;
  workspaceId?: string | null;
}) {
  return {
    filename: overrides?.filename ?? "output.html",
    mimeType: overrides?.mimeType ?? "text/html",
    storageKey: overrides?.storageKey ?? "sandbox-files/conv-1/output.html",
    sizeBytes: overrides?.sizeBytes ?? 42,
    conversation: {
      userId: overrides?.userId ?? "user-1",
      workspaceId: overrides?.workspaceId ?? "ws-1",
    },
  };
}

describe("loadAgenticAppHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadFromS3Mock.mockResolvedValue(Buffer.from("<!doctype html><p>Preview</p>"));
  });

  it("returns HTML for an owned text/html output.html file", async () => {
    await expect(
      loadAgenticAppHtml({
        file: previewFile({ mimeType: "text/html; charset=utf-8" }),
        userId: "user-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({
      html: "<!doctype html><p>Preview</p>",
      filename: "output.html",
      sizeBytes: 42,
    });
    expect(downloadFromS3Mock).toHaveBeenCalledWith("sandbox-files/conv-1/output.html");
  });

  it("rejects files not owned by the active user and workspace", async () => {
    await expect(
      loadAgenticAppHtml({
        file: previewFile({ workspaceId: "ws-2" }),
        userId: "user-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject(new AgenticAppHtmlError("not_found", "File not found"));
    expect(downloadFromS3Mock).not.toHaveBeenCalled();
  });

  it("rejects non-HTML MIME types before downloading", async () => {
    await expect(
      loadAgenticAppHtml({
        file: previewFile({ mimeType: "application/json" }),
        userId: "user-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject(
      new AgenticAppHtmlError("invalid_mime", "File is not an Agentic-App HTML document"),
    );
    expect(downloadFromS3Mock).not.toHaveBeenCalled();
  });

  it("rejects oversized files before downloading when stored size is known", async () => {
    await expect(
      loadAgenticAppHtml({
        file: previewFile({ sizeBytes: AGENTIC_APP_MAX_BYTES + 1 }),
        userId: "user-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject(new AgenticAppHtmlError("too_large", "File is too large to display"));
    expect(downloadFromS3Mock).not.toHaveBeenCalled();
  });

  it("rejects oversized downloaded bodies when stored size is missing", async () => {
    downloadFromS3Mock.mockResolvedValue(Buffer.alloc(AGENTIC_APP_MAX_BYTES + 1));

    await expect(
      loadAgenticAppHtml({
        file: previewFile({ sizeBytes: null }),
        userId: "user-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject(new AgenticAppHtmlError("too_large", "File is too large to display"));
  });
});
