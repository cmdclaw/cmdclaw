import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

const { hasActiveLeaseMock } = vi.hoisted(() => ({
  hasActiveLeaseMock: vi.fn(async () => false),
}));

const { killSandboxMock } = vi.hoisted(() => ({
  killSandboxMock: vi.fn(async () => undefined),
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    select: selectMock,
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
    selectMock.mockReset();
    hasActiveLeaseMock.mockReset();
    hasActiveLeaseMock.mockResolvedValue(false);
    killSandboxMock.mockReset();
    killSandboxMock.mockResolvedValue(undefined);
  });

  it("kills paused sandboxes older than 24h when no active slot lease exists", async () => {
    const selectChain = {
      from: vi.fn(() => selectChain),
      innerJoin: vi.fn(() => selectChain),
      where: vi.fn(async () => [
        {
          runtimeId: "rt-1",
          activeGenerationId: "gen-1",
          conversationId: "conv-1",
        },
      ]),
    };
    selectMock.mockReturnValue(selectChain);

    const summary = await cleanupPausedSandboxes();

    expect(summary).toEqual({
      scanned: 1,
      cleaned: 1,
      skippedWithActiveLease: 0,
    });
    expect(killSandboxMock).toHaveBeenCalledWith("conv-1", "paused_cleanup");
  });

  it("skips cleanup while the current generation still owns a slot lease", async () => {
    const selectChain = {
      from: vi.fn(() => selectChain),
      innerJoin: vi.fn(() => selectChain),
      where: vi.fn(async () => [
        {
          runtimeId: "rt-1",
          activeGenerationId: "gen-1",
          conversationId: "conv-1",
        },
      ]),
    };
    selectMock.mockReturnValue(selectChain);
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
