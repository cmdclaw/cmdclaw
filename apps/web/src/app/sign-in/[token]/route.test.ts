import { describe, expect, it, vi } from "vitest";

const { getMagicLinkRequestStateMock } = vi.hoisted(() => ({
  getMagicLinkRequestStateMock: vi.fn(),
}));

vi.mock("@/server/lib/magic-link-request-state", () => ({
  getMagicLinkRequestState: getMagicLinkRequestStateMock,
}));

import { GET } from "./route";

function getLocation(response: Response): string {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Expected redirect location");
  }
  return location;
}

describe("GET /sign-in/[token]", () => {
  it("redirects to Better Auth verify with the stored callback params", async () => {
    getMagicLinkRequestStateMock.mockResolvedValue({
      tokenHash: "hash-1",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
      expiresAt: new Date("2026-03-21T12:30:00.000Z"),
      createdAt: new Date("2026-03-21T11:30:00.000Z"),
    });

    const response = await GET(new Request("https://cmdclaw.ai/sign-in/abc123"), {
      params: Promise.resolve({ token: "abc123" }),
    });

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://cmdclaw.ai/api/auth/magic-link/verify?token=abc123&callbackURL=%2Fchat&newUserCallbackURL=%2Fwelcome&errorCallbackURL=%2Flogin%3Ferror%3Dmagic-link",
    );
  });

  it("redirects to login when the request state is missing", async () => {
    getMagicLinkRequestStateMock.mockResolvedValue(null);

    const response = await GET(new Request("https://cmdclaw.ai/sign-in/abc123"), {
      params: Promise.resolve({ token: "abc123" }),
    });

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://cmdclaw.ai/login?error=magic-link");
  });
});
