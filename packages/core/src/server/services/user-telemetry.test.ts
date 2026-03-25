import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbMock,
  captureUserActiveTodayMock,
  captureUserSignedUpMock,
  postSignupSlackNotificationMock,
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      user: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
    insert: vi.fn(),
  },
  captureUserActiveTodayMock: vi.fn(),
  captureUserSignedUpMock: vi.fn(),
  postSignupSlackNotificationMock: vi.fn(),
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: dbMock,
}));

vi.mock("./posthog", () => ({
  captureUserActiveToday: captureUserActiveTodayMock,
  captureUserSignedUp: captureUserSignedUpMock,
}));

vi.mock("./telemetry-slack", () => ({
  postSignupSlackNotification: postSignupSlackNotificationMock,
}));

import {
  formatLocalDate,
  inferSignupMethod,
  recordUserActiveToday,
  trackSignupFromSession,
} from "./user-telemetry";

function mockSelectWhereResolvedValue(value: unknown) {
  const where = vi.fn().mockResolvedValue(value);
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ where, innerJoin }));
  dbMock.select.mockReturnValueOnce({ from });
  return { where, innerJoin, from };
}

function mockInsertReturningValue(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  dbMock.insert.mockReturnValueOnce({ values });
  return { values, onConflictDoNothing, returning };
}

describe("user telemetry services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("infers the signup method from auth provider context", () => {
    expect(inferSignupMethod({ body: { provider: "google" } })).toBe("google");
    expect(inferSignupMethod({ path: "/sign-in/magic-link" })).toBe("email");
    expect(inferSignupMethod({ path: "/sign-in/social" })).toBe("social");
  });

  it("captures a signup only for the first successful session", async () => {
    mockSelectWhereResolvedValue([{ value: 1 }]);
    dbMock.query.user.findFirst.mockResolvedValueOnce({
      email: "new@example.com",
      name: "New User",
    });

    const tracked = await trackSignupFromSession({
      session: {
        userId: "user-1",
        createdAt: new Date("2026-03-13T10:00:00.000Z"),
      },
      context: { body: { provider: "google" } },
    });

    expect(tracked).toBe(true);
    expect(captureUserSignedUpMock).toHaveBeenCalledWith({
      distinctId: "user-1",
      email: "new@example.com",
      name: "New User",
      signupMethod: "google",
    });
    expect(postSignupSlackNotificationMock).toHaveBeenCalledWith({
      email: "new@example.com",
      name: "New User",
      signupMethod: "google",
      userId: "user-1",
      occurredAt: new Date("2026-03-13T10:00:00.000Z"),
    });
  });

  it("skips signup capture for later sessions", async () => {
    mockSelectWhereResolvedValue([{ value: 2 }]);

    const tracked = await trackSignupFromSession({
      session: {
        userId: "user-1",
        createdAt: new Date("2026-03-13T10:00:00.000Z"),
      },
    });

    expect(tracked).toBe(false);
    expect(dbMock.query.user.findFirst).not.toHaveBeenCalled();
    expect(captureUserSignedUpMock).not.toHaveBeenCalled();
    expect(postSignupSlackNotificationMock).not.toHaveBeenCalled();
  });

  it("records first daily activity and emits the PostHog event", async () => {
    const occurredAt = new Date(2026, 2, 13, 8, 30, 0);
    const insertMock = mockInsertReturningValue([{ userId: "user-1" }]);

    const result = await recordUserActiveToday({
      userId: "user-1",
      workspaceId: "ws-1",
      occurredAt,
    });

    expect(result).toEqual({
      created: true,
      activityDate: "2026-03-13",
    });
    expect(insertMock.values).toHaveBeenCalledWith({
      userId: "user-1",
      activityDate: "2026-03-13",
      firstSeenAt: occurredAt,
      source: "web",
    });
    expect(captureUserActiveTodayMock).toHaveBeenCalledWith({
      distinctId: "user-1",
      activityDate: "2026-03-13",
      workspaceId: "ws-1",
    });
  });

  it("deduplicates later activity on the same day", async () => {
    mockInsertReturningValue([]);

    const result = await recordUserActiveToday({
      userId: "user-1",
      occurredAt: new Date(2026, 2, 13, 11, 45, 0),
    });

    expect(result).toEqual({
      created: false,
      activityDate: "2026-03-13",
    });
    expect(captureUserActiveTodayMock).not.toHaveBeenCalled();
  });

  it("formats local dates as YYYY-MM-DD", () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });
});
