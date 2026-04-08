import { describe, expect, it } from "vitest";
import {
  buildGenerationTimingLines,
  createGenerationTimingTracker,
} from "./stream-timing";

describe("stream timing", () => {
  it("records first visible output once and completed separately", () => {
    const times = [1_000, 1_120, 1_450];
    const tracker = createGenerationTimingTracker(() => {
      const next = times.shift();
      if (typeof next !== "number") {
        throw new Error("No timestamp available");
      }
      return next;
    });

    tracker.noteVisibleOutput();
    tracker.noteVisibleOutput();
    tracker.noteCompleted();

    expect(tracker.snapshot()).toEqual({
      requestStartedAtMs: 1_000,
      firstVisibleOutputAtMs: 1_120,
      completedAtMs: 1_450,
    });
  });

  it("returns no lines when visible output never arrived", () => {
    const times = [2_000, 2_300];
    const tracker = createGenerationTimingTracker(() => {
      const next = times.shift();
      if (typeof next !== "number") {
        throw new Error("No timestamp available");
      }
      return next;
    });

    tracker.noteCompleted();

    expect(buildGenerationTimingLines(tracker.snapshot())).toEqual([]);
  });

  it("formats elapsed timing in milliseconds and seconds", () => {
    const lines = buildGenerationTimingLines({
      requestStartedAtMs: Date.parse("2026-04-08T10:00:00.000Z"),
      firstVisibleOutputAtMs: Date.parse("2026-04-08T10:00:00.250Z"),
      completedAtMs: Date.parse("2026-04-08T10:00:01.500Z"),
    });

    expect(lines).toEqual([
      "[first_visible_output] 2026-04-08T10:00:00.250Z (+250ms)",
      "[completed] 2026-04-08T10:00:01.500Z (+1.500s)",
    ]);
  });

  it("returns no lines when completion was not recorded", () => {
    expect(
      buildGenerationTimingLines({
        requestStartedAtMs: Date.parse("2026-04-08T10:00:00.000Z"),
        firstVisibleOutputAtMs: Date.parse("2026-04-08T10:00:00.250Z"),
      }),
    ).toEqual([]);
  });
});
