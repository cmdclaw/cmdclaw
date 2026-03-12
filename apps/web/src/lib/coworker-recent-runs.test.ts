import { describe, expect, it } from "vitest";
import { flattenCoworkerRecentRuns } from "./coworker-recent-runs";

describe("flattenCoworkerRecentRuns", () => {
  it("returns individual runs sorted by latest startedAt across coworkers", () => {
    const runs = flattenCoworkerRecentRuns([
      {
        id: "cw-1",
        name: "Builder coworker",
        recentRuns: [{ id: "run-older", status: "success", startedAt: "2026-03-11T09:00:00.000Z" }],
      },
      {
        id: "cw-2",
        name: "Sales coworker",
        recentRuns: [
          { id: "run-latest", status: "running", startedAt: "2026-03-12T10:00:00.000Z" },
          { id: "run-middle", status: "error", startedAt: "2026-03-12T08:00:00.000Z" },
        ],
      },
    ]);

    expect(runs.map((run) => run.id)).toEqual(["run-latest", "run-middle", "run-older"]);
    expect(runs[0]).toMatchObject({
      coworkerId: "cw-2",
      coworkerName: "Sales coworker",
      status: "running",
    });
  });

  it("falls back to Untitled when the coworker name is blank", () => {
    const runs = flattenCoworkerRecentRuns([
      {
        id: "cw-1",
        name: "   ",
        recentRuns: [{ id: "run-1", status: "success", startedAt: null }],
      },
    ]);

    expect(runs[0]?.coworkerName).toBe("Untitled");
  });
});
