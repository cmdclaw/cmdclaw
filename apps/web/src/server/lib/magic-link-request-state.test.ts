import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashMagicLinkToken } from "@/lib/magic-link-request";

const {
  deleteWhereMock,
  deleteMock,
  insertValuesMock,
  onConflictDoUpdateMock,
  insertMock,
  findFirstMock,
} = vi.hoisted(() => {
  const deleteWhereMock = vi.fn();
  const onConflictDoUpdateMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({
    onConflictDoUpdate: onConflictDoUpdateMock,
  }));
  const deleteMock = vi.fn(() => ({
    where: deleteWhereMock,
  }));
  const insertMock = vi.fn(() => ({
    values: insertValuesMock,
  }));
  const findFirstMock = vi.fn();

  return {
    deleteWhereMock,
    deleteMock,
    insertValuesMock,
    onConflictDoUpdateMock,
    insertMock,
    findFirstMock,
  };
});

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    delete: deleteMock,
    insert: insertMock,
    query: {
      magicLinkRequestState: {
        findFirst: findFirstMock,
      },
    },
  },
}));

import {
  createMagicLinkRequestState,
  getMagicLinkRequestState,
  MAGIC_LINK_REQUEST_TTL_MS,
} from "./magic-link-request-state";

describe("magic-link-request-state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T12:00:00.000Z"));
    vi.clearAllMocks();
    deleteWhereMock.mockResolvedValue(undefined);
    onConflictDoUpdateMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores redirect targets keyed by a token hash", async () => {
    const requestState = await createMagicLinkRequestState({
      token: "abc123",
      email: "pilot@cmdclaw.ai",
      verificationUrl:
        "https://cmdclaw.ai/api/auth/magic-link/verify?token=abc123&callbackURL=%2Fchat&newUserCallbackURL=%2Fwelcome&errorCallbackURL=%2Flogin%3Ferror%3Dmagic-link",
    });

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith({
      tokenHash: hashMagicLinkToken("abc123"),
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
      expiresAt: new Date(Date.now() + MAGIC_LINK_REQUEST_TTL_MS),
    });
    expect(requestState).toMatchObject({
      tokenHash: hashMagicLinkToken("abc123"),
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });
  });

  it("returns a valid unexpired row for a token", async () => {
    const row = {
      tokenHash: hashMagicLinkToken("abc123"),
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/chat",
      errorCallbackUrl: "/login?error=magic-link",
      expiresAt: new Date("2026-03-20T12:30:00.000Z"),
      createdAt: new Date("2026-03-20T11:30:00.000Z"),
    };
    findFirstMock.mockResolvedValue(row);

    await expect(getMagicLinkRequestState("abc123")).resolves.toEqual(row);
  });

  it("rejects expired rows", async () => {
    findFirstMock.mockResolvedValue({
      tokenHash: hashMagicLinkToken("abc123"),
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/chat",
      errorCallbackUrl: "/login?error=magic-link",
      expiresAt: new Date("2026-03-20T11:59:59.000Z"),
      createdAt: new Date("2026-03-20T11:00:00.000Z"),
    });

    await expect(getMagicLinkRequestState("abc123")).resolves.toBeNull();
  });
});
