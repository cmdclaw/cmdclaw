import { describe, expect, test } from "vitest";

import {
  MAX_RUNNING_WORKTREE_WEB_PROCESSES,
  shouldBlockStartingWorktreeWeb,
  summarizeRunningWorktreeWebProcesses,
} from "./start-guard";

describe("worktree start guard", () => {
  test("allows starting while fewer than five recognized worktree web processes are running", () => {
    const summary = summarizeRunningWorktreeWebProcesses({
      currentRepoRoot: "/tmp/wt-4",
      snapshots: [
        { repoRoot: "/tmp/wt-1", recognized: true, webPid: 101, webRunning: true },
        { repoRoot: "/tmp/wt-2", recognized: true, webPid: 102, webRunning: true },
        { repoRoot: "/tmp/wt-3", recognized: true, webPid: 103, webRunning: true },
        { repoRoot: "/tmp/main", recognized: false, webPid: 201, webRunning: true },
      ],
    });

    expect(summary).toEqual({
      totalRunning: 3,
      currentWorktreeOwnsRunningWeb: false,
      runningRepoRoots: ["/tmp/wt-1", "/tmp/wt-2", "/tmp/wt-3"],
    });
    expect(shouldBlockStartingWorktreeWeb(summary)).toBe(false);
  });

  test("blocks starting the sixth recognized worktree web process", () => {
    const summary = summarizeRunningWorktreeWebProcesses({
      currentRepoRoot: "/tmp/wt-6",
      snapshots: [
        { repoRoot: "/tmp/wt-1", recognized: true, webPid: 101, webRunning: true },
        { repoRoot: "/tmp/wt-2", recognized: true, webPid: 102, webRunning: true },
        { repoRoot: "/tmp/wt-3", recognized: true, webPid: 103, webRunning: true },
        { repoRoot: "/tmp/wt-4", recognized: true, webPid: 104, webRunning: true },
        { repoRoot: "/tmp/wt-5", recognized: true, webPid: 105, webRunning: true },
      ],
    });

    expect(summary.totalRunning).toBe(MAX_RUNNING_WORKTREE_WEB_PROCESSES);
    expect(summary.currentWorktreeOwnsRunningWeb).toBe(false);
    expect(shouldBlockStartingWorktreeWeb(summary)).toBe(true);
  });

  test("does not block restarting the current worktree when it already owns one of the five", () => {
    const summary = summarizeRunningWorktreeWebProcesses({
      currentRepoRoot: "/tmp/wt-5/",
      snapshots: [
        { repoRoot: "/tmp/wt-1", recognized: true, webPid: 101, webRunning: true },
        { repoRoot: "/tmp/wt-2", recognized: true, webPid: 102, webRunning: true },
        { repoRoot: "/tmp/wt-3", recognized: true, webPid: 103, webRunning: true },
        { repoRoot: "/tmp/wt-4", recognized: true, webPid: 104, webRunning: true },
        { repoRoot: "/tmp/wt-5", recognized: true, webPid: 105, webRunning: true },
        { repoRoot: "/tmp/wt-6", recognized: true, webPid: 106, webRunning: false },
      ],
    });

    expect(summary.totalRunning).toBe(MAX_RUNNING_WORKTREE_WEB_PROCESSES);
    expect(summary.currentWorktreeOwnsRunningWeb).toBe(true);
    expect(shouldBlockStartingWorktreeWeb(summary)).toBe(false);
  });
});
