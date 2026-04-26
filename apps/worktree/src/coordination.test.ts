import { describe, expect, test } from "vitest";

import {
  buildWorktreeSlotLease,
  isWorktreeSlotLeaseFresh,
  isWorktreeSlotLeaseOwnedByInstance,
  refreshWorktreeSlotLease,
  resolveSharedWorktreeRoot,
  resolveSharedWorktreeSlotLeasePath,
  SLOT_LEASE_STALE_GRACE_MS,
} from "./coordination";

describe("worktree coordination helpers", () => {
  test("resolves the shared coordination root under ~/.cmdclaw/worktrees", () => {
    expect(resolveSharedWorktreeRoot("/Users/example")).toBe("/Users/example/.cmdclaw/worktrees");
  });

  test("derives deterministic slot lease paths", () => {
    expect(resolveSharedWorktreeSlotLeasePath("/Users/example/.cmdclaw/worktrees", 2)).toBe(
      "/Users/example/.cmdclaw/worktrees/locks/slot-02.json",
    );
  });

  test("builds and refreshes slot lease records", () => {
    const lease = buildWorktreeSlotLease({
      slot: 2,
      instanceId: "cmdclaw-1234abcd",
      repoRoot: "/tmp/worktree",
      pid: 42,
      now: new Date("2026-04-25T07:30:00.000Z"),
    });

    expect(lease).toMatchObject({
      version: 1,
      slot: 2,
      instanceId: "cmdclaw-1234abcd",
      repoRoot: "/tmp/worktree",
      pid: 42,
      createdAt: "2026-04-25T07:30:00.000Z",
      updatedAt: "2026-04-25T07:30:00.000Z",
    });

    expect(
      refreshWorktreeSlotLease(lease, new Date("2026-04-25T07:31:00.000Z")).updatedAt,
    ).toBe("2026-04-25T07:31:00.000Z");
  });

  test("matches lease ownership by repo root and instance id", () => {
    const lease = buildWorktreeSlotLease({
      slot: 2,
      instanceId: "cmdclaw-1234abcd",
      repoRoot: "/tmp/worktree",
      pid: 42,
      now: new Date("2026-04-25T07:30:00.000Z"),
    });

    expect(
      isWorktreeSlotLeaseOwnedByInstance(lease, {
        instanceId: "cmdclaw-1234abcd",
        repoRoot: "/tmp/worktree",
      }),
    ).toBe(true);

    expect(
      isWorktreeSlotLeaseOwnedByInstance(lease, {
        instanceId: "cmdclaw-1234abcd",
        repoRoot: "/tmp/other",
      }),
    ).toBe(false);
  });

  test("treats recent leases as fresh and malformed timestamps as stale", () => {
    expect(
      isWorktreeSlotLeaseFresh(
        { updatedAt: "2026-04-25T07:30:30.000Z" },
        new Date("2026-04-25T07:31:00.000Z"),
        SLOT_LEASE_STALE_GRACE_MS,
      ),
    ).toBe(true);

    expect(
      isWorktreeSlotLeaseFresh(
        { updatedAt: "not-a-date" },
        new Date("2026-04-25T07:31:00.000Z"),
        SLOT_LEASE_STALE_GRACE_MS,
      ),
    ).toBe(false);
  });
});
