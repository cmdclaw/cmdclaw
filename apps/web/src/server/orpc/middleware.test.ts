import type { Session, User } from "better-auth";
import { describe, expect, it, vi } from "vitest";

type VitestProcedure = Extract<
  NonNullable<Parameters<typeof vi.fn>[0]>,
  (...args: never[]) => unknown
>;

vi.mock("@bap/core/server/services/user-telemetry", () => ({
  recordUserActiveToday: vi.fn<VitestProcedure>(),
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
