export type GenerationTiming = {
  requestStartedAtMs: number;
  firstVisibleOutputAtMs?: number;
  completedAtMs?: number;
};

export function createGenerationTimingTracker(now: () => number = Date.now) {
  const timing: GenerationTiming = {
    requestStartedAtMs: now(),
  };

  return {
    noteVisibleOutput(): void {
      timing.firstVisibleOutputAtMs ??= now();
    },
    noteCompleted(): void {
      timing.completedAtMs = now();
    },
    snapshot(): GenerationTiming {
      return { ...timing };
    },
  };
}

function formatElapsed(elapsedMs: number): string {
  if (elapsedMs < 1_000) {
    return `${elapsedMs}ms`;
  }

  return `${(elapsedMs / 1_000).toFixed(3)}s`;
}

function formatTimingLine(
  label: "first_visible_output" | "completed",
  atMs: number,
  requestStartedAtMs: number,
): string {
  return `[${label}] ${new Date(atMs).toISOString()} (+${formatElapsed(atMs - requestStartedAtMs)})`;
}

export function buildGenerationTimingLines(timing: GenerationTiming): string[] {
  if (
    typeof timing.firstVisibleOutputAtMs !== "number" ||
    typeof timing.completedAtMs !== "number"
  ) {
    return [];
  }

  return [
    formatTimingLine(
      "first_visible_output",
      timing.firstVisibleOutputAtMs,
      timing.requestStartedAtMs,
    ),
    formatTimingLine("completed", timing.completedAtMs, timing.requestStartedAtMs),
  ];
}
