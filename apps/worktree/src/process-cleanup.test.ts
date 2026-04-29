import { describe, expect, test } from "vitest";

import {
  collectNextProcessCleanupCandidates,
  type SystemProcess,
} from "./process-cleanup";

describe("worktree process cleanup", () => {
  test("collects an untracked Next.js process tree under a recognized worktree root", () => {
    const processes: SystemProcess[] = [
      {
        pid: 10,
        ppid: 1,
        command:
          "bun --env-file /Users/dev/.codex/worktrees/abcd/cmdclaw/.env next dev --webpack --port 3718",
      },
      {
        pid: 11,
        ppid: 10,
        command:
          "node /Users/dev/.codex/worktrees/abcd/cmdclaw/apps/web/node_modules/.bin/next dev --webpack --port 3718",
      },
      { pid: 12, ppid: 11, command: "next-server (v16.1.6)" },
    ];

    expect(
      collectNextProcessCleanupCandidates({
        processes,
        worktreeRoots: ["/Users/dev/.codex/worktrees"],
      }).map((processEntry) => processEntry.pid),
    ).toEqual([10, 11, 12]);
  });

  test("protects tracked background web process descendants", () => {
    const processes: SystemProcess[] = [
      {
        pid: 20,
        ppid: 1,
        command:
          "bun --env-file /Users/dev/.codex/worktrees/tracked/cmdclaw/.env next dev --webpack --port 3701",
      },
      {
        pid: 21,
        ppid: 20,
        command:
          "node /Users/dev/.codex/worktrees/tracked/cmdclaw/apps/web/node_modules/.bin/next dev --webpack --port 3701",
      },
      { pid: 22, ppid: 21, command: "next-server (v16.1.6)" },
      {
        pid: 30,
        ppid: 1,
        command:
          "bun --env-file /Users/dev/.codex/worktrees/orphan/cmdclaw/.env next dev --webpack --port 3702",
      },
    ];

    expect(
      collectNextProcessCleanupCandidates({
        processes,
        worktreeRoots: ["/Users/dev/.codex/worktrees"],
        protectedRootPids: [20],
      }).map((processEntry) => processEntry.pid),
    ).toEqual([30]);
  });

  test("ignores Next.js processes outside recognized worktree roots", () => {
    const processes: SystemProcess[] = [
      {
        pid: 40,
        ppid: 1,
        command:
          "bun --env-file /Users/dev/Git/cmdclaw/.env next dev --webpack --port 3000",
      },
      {
        pid: 41,
        ppid: 40,
        command:
          "node /Users/dev/Git/cmdclaw/apps/web/node_modules/.bin/next dev --webpack --port 3000",
      },
    ];

    expect(
      collectNextProcessCleanupCandidates({
        processes,
        worktreeRoots: ["/Users/dev/.codex/worktrees"],
      }),
    ).toEqual([]);
  });
});
