import { beforeEach, describe, expect, it, vi } from "vitest";

function createProcedureStub() {
  const stub = {
    input: vi.fn(),
    output: vi.fn(),
    handler: vi.fn((fn: unknown) => fn),
  };
  stub.input.mockReturnValue(stub);
  stub.output.mockReturnValue(stub);
  return stub;
}

const {
  queueAddMock,
  getQueueMock,
  updateSetMock,
  updateWhereMock,
  updateReturningMock,
  insertValuesMock,
  insertOnConflictDoNothingMock,
  findAuthUserByEmailMock,
  findAuthUserByIdMock,
  resolveOrCreateAuthUserByEmailMock,
  setCredentialPasswordMock,
} = vi.hoisted(() => ({
  queueAddMock: vi.fn(),
  getQueueMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  updateReturningMock: vi.fn(),
  insertValuesMock: vi.fn(),
  insertOnConflictDoNothingMock: vi.fn(),
  findAuthUserByEmailMock: vi.fn(),
  findAuthUserByIdMock: vi.fn(),
  resolveOrCreateAuthUserByEmailMock: vi.fn(),
  setCredentialPasswordMock: vi.fn(),
}));

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("@cmdclaw/core/server/queues", () => ({
  SCHEDULED_COWORKER_JOB_NAME: "coworker:scheduled-trigger",
  buildQueueJobId: vi.fn((parts: Array<string | number>) => parts.join("-")),
  getQueue: getQueueMock,
}));

vi.mock("@/server/lib/credential-accounts", () => ({
  findAuthUserByEmail: findAuthUserByEmailMock,
  findAuthUserById: findAuthUserByIdMock,
  resolveOrCreateAuthUserByEmail: resolveOrCreateAuthUserByEmailMock,
  setCredentialPassword: setCredentialPasswordMock,
}));

import { adminRouter } from "./admin";

const adminRouterAny = adminRouter as unknown as Record<
  string,
  (args: unknown) => Promise<unknown>
>;

function createContext() {
  return {
    user: { id: "admin-user-1" },
    db: {
      query: {
        user: {
          findFirst: vi.fn(),
        },
        coworker: {
          findMany: vi.fn(),
        },
      },
      insert: vi.fn(() => ({
        values: insertValuesMock,
      })),
      update: vi.fn(() => ({
        set: updateSetMock,
      })),
      execute: vi.fn(),
    },
  };
}

function collectSqlText(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => collectSqlText(item)).join(" ");
  }

  if (!node || typeof node !== "object") {
    return "";
  }

  const record = node as { value?: unknown; queryChunks?: unknown[] };
  return `${collectSqlText(record.value)} ${collectSqlText(record.queryChunks)}`.trim();
}

describe("adminRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueAddMock.mockResolvedValue(undefined);
    getQueueMock.mockReturnValue({
      add: queueAddMock,
    });
    updateSetMock.mockReturnValue({
      where: updateWhereMock,
    });
    updateWhereMock.mockReturnValue({
      returning: updateReturningMock,
    });
    insertValuesMock.mockReturnValue({
      onConflictDoNothing: insertOnConflictDoNothingMock,
    });
    insertOnConflictDoNothingMock.mockResolvedValue(undefined);
    resolveOrCreateAuthUserByEmailMock.mockResolvedValue({
      id: "user-2",
      email: "member@example.com",
      name: "Member",
    });
  });

  it("updates a user's admin role", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue({ role: "admin" });
    updateReturningMock.mockResolvedValue([{ id: "user-2", role: "admin" }]);

    const result = await adminRouterAny.setUserAdminRole({
      input: { userId: "user-2", isAdmin: true },
      context,
    });

    expect(context.db.update).toHaveBeenCalledTimes(1);
    expect(updateSetMock).toHaveBeenCalledWith({ role: "admin" });
    expect(result).toEqual({ id: "user-2", role: "admin" });
  });

  it("rejects removing your own admin access", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue({ role: "admin" });

    await expect(
      adminRouterAny.setUserAdminRole({
        input: { userId: "admin-user-1", isAdmin: false },
        context,
      }),
    ).rejects.toMatchObject({
      message: "You cannot remove your own admin access.",
    });

    expect(context.db.update).not.toHaveBeenCalled();
  });

  it("grants admin access by email", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue({ role: "admin" });
    updateReturningMock.mockResolvedValue([
      {
        id: "user-2",
        email: "member@example.com",
        name: "Member",
        role: "admin",
      },
    ]);

    const result = await adminRouterAny.grantAdminAccessByEmail({
      input: { email: "member@example.com" },
      context,
    });

    expect(resolveOrCreateAuthUserByEmailMock).toHaveBeenCalledWith({
      email: "member@example.com",
      name: undefined,
    });
    expect(updateSetMock).toHaveBeenCalledWith({ role: "admin" });
    expect(result).toEqual({
      id: "user-2",
      email: "member@example.com",
      name: "Member",
      role: "admin",
    });
  });

  it("lists scheduled coworkers for ops", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue({ role: "admin" });
    context.db.query.coworker.findMany.mockResolvedValue([
      {
        id: "cw-1",
        name: "Hourly Sync",
        username: "hourly-sync",
        status: "on",
        schedule: { type: "interval", intervalMinutes: 60 },
        updatedAt: new Date("2026-04-04T09:00:00.000Z"),
      },
      {
        id: "cw-2",
        name: "Daily Digest",
        username: null,
        status: "off",
        schedule: { type: "daily", time: "09:00", timezone: "UTC" },
        updatedAt: new Date("2026-04-04T09:10:00.000Z"),
      },
    ]);
    context.db.execute.mockResolvedValue({
      rows: [
        {
          coworkerId: "cw-1",
          runId: "run-1",
          status: "error",
          startedAt: new Date("2026-04-04T08:00:00.000Z"),
          finishedAt: new Date("2026-04-04T08:01:00.000Z"),
          errorMessage: "Agent preparation timed out after 45 seconds.",
        },
      ],
    });

    const result = await adminRouterAny.getOpsScheduledCoworkers({ context });

    expect(result).toEqual([
      {
        id: "cw-1",
        name: "Hourly Sync",
        username: "hourly-sync",
        status: "on",
        schedule: { type: "interval", intervalMinutes: 60 },
        isHourlyInterval: true,
        updatedAt: new Date("2026-04-04T09:00:00.000Z"),
        latestRun: {
          id: "run-1",
          status: "error",
          startedAt: new Date("2026-04-04T08:00:00.000Z"),
          finishedAt: new Date("2026-04-04T08:01:00.000Z"),
          errorMessage: "Agent preparation timed out after 45 seconds.",
        },
      },
      {
        id: "cw-2",
        name: "Daily Digest",
        username: null,
        status: "off",
        schedule: { type: "daily", time: "09:00", timezone: "UTC" },
        isHourlyInterval: false,
        updatedAt: new Date("2026-04-04T09:10:00.000Z"),
        latestRun: null,
      },
    ]);
  });

  it("reads performance metrics from generationDurationMs with legacy fallback", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue({ role: "admin" });
    context.db.execute
      .mockResolvedValueOnce({
        rows: [
          {
            totalMessages: 479,
            p50EndToEndMs: 47455,
            p95EndToEndMs: 1352436,
            p50TtfvoMs: 6963,
            sandboxReusedCount: 24,
            sandboxTotalCount: 479,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            avgSandboxConnectMs: 1000,
            avgOpencodeReadyMs: 5000,
            avgSessionReadyMs: 700,
            avgPrePromptSetupMs: 9000,
            avgWaitForFirstEventMs: 400,
            avgPromptToFirstTokenMs: 8000,
            avgModelStreamMs: 15000,
            avgPostProcessingMs: 1200,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = (await adminRouterAny.getPerformanceDashboard({
      input: { days: "7" },
      context,
    })) as {
      summary: {
        totalMessages: number;
        p50EndToEndMs: number;
        p95EndToEndMs: number;
        p50TtfvoMs: number;
        sandboxReuseRate: number;
      };
    };

    expect(result.summary).toEqual({
      totalMessages: 479,
      p50EndToEndMs: 47455,
      p95EndToEndMs: 1352436,
      p50TtfvoMs: 6963,
      sandboxReuseRate: 5,
    });

    const firstQuery = collectSqlText(context.db.execute.mock.calls[0]?.[0]);
    expect(firstQuery).toContain("generationDurationMs");
    expect(firstQuery).toContain("endToEndDurationMs");
  });

  it("enqueues selected scheduled coworkers now and skips invalid targets", async () => {
    const context = createContext();
    context.db.query.user.findFirst.mockResolvedValue({ role: "admin" });
    context.db.query.coworker.findMany.mockResolvedValue([
      {
        id: "cw-1",
        name: "Hourly Sync",
        status: "on",
        triggerType: "schedule",
        schedule: { type: "interval", intervalMinutes: 60 },
      },
      {
        id: "cw-2",
        name: "Disabled Digest",
        status: "off",
        triggerType: "schedule",
        schedule: { type: "interval", intervalMinutes: 60 },
      },
      {
        id: "cw-3",
        name: "Manual Worker",
        status: "on",
        triggerType: "manual",
        schedule: null,
      },
    ]);

    const result = (await adminRouterAny.enqueueScheduledCoworkersNow({
      input: { ids: ["cw-1", "cw-2", "cw-3", "cw-4"] },
      context,
    })) as {
      enqueuedCount: number;
      skippedCount: number;
      results: Array<{ id: string; ok: boolean; reason?: string }>;
    };

    expect(queueAddMock).toHaveBeenCalledTimes(1);
    expect(queueAddMock).toHaveBeenCalledWith(
      "coworker:scheduled-trigger",
      expect.objectContaining({
        source: "schedule",
        coworkerId: "cw-1",
        scheduleType: "interval",
      }),
      expect.objectContaining({
        removeOnComplete: true,
        removeOnFail: 200,
      }),
    );
    expect(result.enqueuedCount).toBe(1);
    expect(result.skippedCount).toBe(3);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "cw-1", ok: true }),
        expect.objectContaining({ id: "cw-2", ok: false, reason: "off" }),
        expect.objectContaining({
          id: "cw-3",
          ok: false,
          reason: "not_scheduled",
        }),
        expect.objectContaining({ id: "cw-4", ok: false, reason: "not_found" }),
      ]),
    );
  });
});
