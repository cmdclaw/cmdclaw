import { describe, expect, it } from "vitest";
import type { Message } from "./message-list";
import { findLatestAgenticAppFile } from "./agentic-app-selection";

function assistantMessage(id: string, filenames: string[]): Message {
  return {
    id,
    role: "assistant",
    content: "Done",
    sandboxFiles: filenames.map((filename, index) => ({
      fileId: `${id}-file-${index}`,
      path: `/app/${filename}`,
      filename,
      mimeType: filename === "output.html" ? "text/html" : "application/octet-stream",
      sizeBytes: 10,
    })),
  };
}

describe("findLatestAgenticAppFile", () => {
  it("returns null when no sandbox file is named exactly output.html", () => {
    expect(
      findLatestAgenticAppFile([
        assistantMessage("msg-1", ["my-output.html"]),
        assistantMessage("msg-2", ["output.htm", "output.HTML"]),
      ]),
    ).toBeNull();
  });

  it("selects the newest output.html across messages", () => {
    const first = assistantMessage("msg-1", ["output.html"]);
    const second = assistantMessage("msg-2", ["report.pdf", "output.html"]);

    expect(findLatestAgenticAppFile([first, second])).toEqual(second.sandboxFiles?.[1]);
  });

  it("selects the latest output.html within the latest matching message", () => {
    const message = assistantMessage("msg-1", ["output.html", "report.pdf", "output.html"]);

    expect(findLatestAgenticAppFile([message])).toEqual(message.sandboxFiles?.[2]);
  });

  it("prefers a newer persisted sandbox file over older message files", () => {
    const message = assistantMessage("msg-1", ["output.html"]);
    const persisted = assistantMessage("persisted", ["output.html"]).sandboxFiles?.[0];

    expect(
      findLatestAgenticAppFile({
        messages: [message],
        persistedSandboxFiles: persisted ? [persisted] : [],
      }),
    ).toEqual(persisted);
  });

  it("prefers a done artifact output.html over persisted and message files", () => {
    const message = assistantMessage("msg-1", ["output.html"]);
    const persisted = assistantMessage("persisted", ["output.html"]).sandboxFiles?.[0];
    const doneArtifact = assistantMessage("done", ["output.html"]).sandboxFiles?.[0];

    expect(
      findLatestAgenticAppFile({
        messages: [message],
        persistedSandboxFiles: persisted ? [persisted] : [],
        doneArtifacts: {
          sandboxFiles: doneArtifact ? [doneArtifact] : [],
        },
      }),
    ).toEqual(doneArtifact);
  });
});
