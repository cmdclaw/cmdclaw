import type { Session, User } from "better-auth";
import { describe, expect, it, vi } from "vitest";

vi.mock("@cmdclaw/core/server/services/user-telemetry", () => ({
  recordUserActiveToday: vi.fn(),
}));

import { resolveDailyActivityUserId } from "./middleware";

const baseUser = {
  id: "target-user-id",
} as User;

const baseSession = {
  userId: "target-user-id",
} as Session;

describe("ORPC auth middleware", () => {
  it("records daily activity for the authenticated user in normal sessions", () => {
    expect(resolveDailyActivityUserId({ session: baseSession, user: baseUser })).toBe(
      "target-user-id",
    );
  });

  it("records daily activity for the admin actor in impersonated sessions", () => {
    const impersonatedSession = {
      ...baseSession,
      impersonatedBy: "admin-user-id",
    } as Session & { impersonatedBy: string };

    expect(resolveDailyActivityUserId({ session: impersonatedSession, user: baseUser })).toBe(
      "admin-user-id",
    );
  });
});
