import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { triggerCoworkerRunMock } = vi.hoisted(() => ({
  triggerCoworkerRunMock: vi.fn(),
}));

vi.mock("../services/coworker-service", () => ({
  triggerCoworkerRun: triggerCoworkerRunMock,
}));

import { handleScheduledCoworkerJob } from "./index";

describe("handleScheduledCoworkerJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips active-run conflicts for scheduled coworkers", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    triggerCoworkerRunMock.mockRejectedValueOnce({
      code: "BAD_REQUEST",
      status: 400,
      message: "Coworker already has an active run",
    });

    await expect(
      handleScheduledCoworkerJob({
        id: "repeat:coworker:wf-1:1",
        data: { coworkerId: "wf-1", scheduleType: "interval" },
      } as Parameters<typeof handleScheduledCoworkerJob>[0]),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      "[worker] skipped scheduled coworker trigger because run is already active for coworker wf-1",
    );
  });

  it("still throws unexpected scheduled coworker errors", async () => {
    const error = new Error("database unavailable");
    triggerCoworkerRunMock.mockRejectedValueOnce(error);

    await expect(
      handleScheduledCoworkerJob({
        id: "repeat:coworker:wf-1:1",
        data: { coworkerId: "wf-1", scheduleType: "interval" },
      } as Parameters<typeof handleScheduledCoworkerJob>[0]),
    ).rejects.toThrow(error);
  });
});
