import { beforeEach, describe, expect, it, vi } from "vitest";

const { conversationFindManyMock } = vi.hoisted(() => ({
  conversationFindManyMock: vi.fn(),
}));

const { hasActiveLeaseMock } = vi.hoisted(() => ({
  hasActiveLeaseMock: vi.fn(async () => false),
}));

const { killSandboxMock } = vi.hoisted(() => ({
  killSandboxMock: vi.fn(async () => undefined),
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    query: {
      conversation: {
        findMany: conversationFindManyMock,
      },
    },
  },
}));

vi.mock("./sandbox-slot-manager", () => ({
  getSandboxSlotManager: () => ({
    hasActiveLease: hasActiveLeaseMock,
  }),
}));

vi.mock("../sandbox/e2b", () => ({
  killSandbox: killSandboxMock,
}));

import { cleanupPausedSandboxes } from "./paused-sandbox-cleanup";

describe("cleanupPausedSandboxes", () => {
  beforeEach(() => {
    conversationFindManyMock.mockReset();
    hasActiveLeaseMock.mockReset();
    hasActiveLeaseMock.mockResolvedValue(false);
    killSandboxMock.mockReset();
    killSandboxMock.mockResolvedValue(undefined);
  });

  it("kills paused sandboxes older than 24h when no active slot lease exists", async () => {
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        currentGenerationId: "gen-1",
      },
    ]);

    const summary = await cleanupPausedSandboxes();

    expect(summary).toEqual({
      scanned: 1,
      cleaned: 1,
      skippedWithActiveLease: 0,
    });
    expect(killSandboxMock).toHaveBeenCalledWith("conv-1", "paused_cleanup");
  });

  it("skips cleanup while the current generation still owns a slot lease", async () => {
    conversationFindManyMock.mockResolvedValue([
      {
        id: "conv-1",
        currentGenerationId: "gen-1",
      },
    ]);
    hasActiveLeaseMock.mockResolvedValue(true);

    const summary = await cleanupPausedSandboxes();

    expect(summary).toEqual({
      scanned: 1,
      cleaned: 0,
      skippedWithActiveLease: 1,
    });
    expect(killSandboxMock).not.toHaveBeenCalled();
  });
});
