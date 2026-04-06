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

const { queueAddMock, getQueueMock } = vi.hoisted(() => ({
  queueAddMock: vi.fn(),
  getQueueMock: vi.fn(),
}));

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("@cmdclaw/core/server/queues", () => ({
  SCHEDULED_COWORKER_JOB_NAME: "coworker:scheduled-trigger",
  buildQueueJobId: vi.fn((parts: Array<string | number>) => parts.join("-")),
  getQueue: getQueueMock,
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
      execute: vi.fn(),
    },
  };
}

describe("adminRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueAddMock.mockResolvedValue(undefined);
    getQueueMock.mockReturnValue({
      add: queueAddMock,
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
