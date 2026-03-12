// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingCoworkerPrompt,
  readPendingCoworkerPrompt,
  writePendingCoworkerPrompt,
} from "./pending-coworker-prompt";

describe("pending-coworker-prompt", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  it("stores and reads a trimmed prompt", () => {
    writePendingCoworkerPrompt("  Draft my onboarding coworker  ");

    expect(readPendingCoworkerPrompt()).toBe("Draft my onboarding coworker");
  });

  it("clears malformed payloads", () => {
    globalThis.localStorage?.setItem("cmdclaw.pendingCoworkerPrompt", "{bad json");

    expect(readPendingCoworkerPrompt()).toBeNull();
    expect(globalThis.localStorage?.getItem("cmdclaw.pendingCoworkerPrompt")).toBeNull();
  });

  it("expires old prompts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));

    writePendingCoworkerPrompt("Review latest support tickets");
    vi.setSystemTime(new Date("2026-03-12T12:11:00.000Z"));

    expect(readPendingCoworkerPrompt()).toBeNull();
    expect(globalThis.localStorage?.getItem("cmdclaw.pendingCoworkerPrompt")).toBeNull();

    vi.useRealTimers();
  });

  it("removes the stored prompt", () => {
    writePendingCoworkerPrompt("Build a daily digest");
    clearPendingCoworkerPrompt();

    expect(readPendingCoworkerPrompt()).toBeNull();
  });
});
