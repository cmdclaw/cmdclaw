// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingCoworkerPrompt,
  getPendingCoworkerGenerationContent,
  readPendingCoworkerPrompt,
  writePendingCoworkerPrompt,
} from "./pending-coworker-prompt";

describe("pending-coworker-prompt", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  it("stores and reads a trimmed prompt with attachments", () => {
    writePendingCoworkerPrompt({
      initialMessage: "  Draft my onboarding coworker  ",
      attachments: [
        {
          name: "brief.pdf",
          mimeType: "application/pdf",
          dataUrl: "data:application/pdf;base64,ZmFrZQ==",
        },
      ],
    });

    expect(readPendingCoworkerPrompt()).toEqual({
      initialMessage: "Draft my onboarding coworker",
      attachments: [
        {
          name: "brief.pdf",
          mimeType: "application/pdf",
          dataUrl: "data:application/pdf;base64,ZmFrZQ==",
        },
      ],
    });
  });

  it("clears malformed payloads", () => {
    globalThis.localStorage?.setItem("cmdclaw.pendingCoworkerPrompt", "{bad json");

    expect(readPendingCoworkerPrompt()).toBeNull();
    expect(globalThis.localStorage?.getItem("cmdclaw.pendingCoworkerPrompt")).toBeNull();
  });

  it("expires old prompts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));

    writePendingCoworkerPrompt({ initialMessage: "Review latest support tickets" });
    vi.setSystemTime(new Date("2026-03-12T12:11:00.000Z"));

    expect(readPendingCoworkerPrompt()).toBeNull();
    expect(globalThis.localStorage?.getItem("cmdclaw.pendingCoworkerPrompt")).toBeNull();

    vi.useRealTimers();
  });

  it("removes the stored prompt", () => {
    writePendingCoworkerPrompt({ initialMessage: "Build a daily digest" });
    clearPendingCoworkerPrompt();

    expect(readPendingCoworkerPrompt()).toBeNull();
  });

  it("resolves a fallback message when only attachments are present", () => {
    const pendingPrompt = {
      initialMessage: "",
      attachments: [
        {
          name: "notes.txt",
          mimeType: "text/plain",
          dataUrl: "data:text/plain;base64,bm90ZXM=",
        },
      ],
    };

    writePendingCoworkerPrompt(pendingPrompt);

    expect(readPendingCoworkerPrompt()).toEqual(pendingPrompt);
    expect(getPendingCoworkerGenerationContent(pendingPrompt)).toBe(
      "Use the attached files as context while building this coworker.",
    );
  });
});
