import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMagicLinkMock } = vi.hoisted(() => ({
  signInMagicLinkMock: vi.fn(),
}));

const { resolveMagicLinkPageStateMock } = vi.hoisted(() => ({
  resolveMagicLinkPageStateMock: vi.fn(),
}));

const { isSameOriginRequestMock } = vi.hoisted(() => ({
  isSameOriginRequestMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signInMagicLink: signInMagicLinkMock,
    },
  },
}));

vi.mock("@/server/lib/magic-link-request-state", () => ({
  resolveMagicLinkPageState: resolveMagicLinkPageStateMock,
}));

vi.mock("@/server/lib/same-origin", () => ({
  isSameOriginRequest: isSameOriginRequestMock,
}));

import { POST } from "./route";

function getLocation(response: Response): string {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Expected redirect location");
  }
  return location;
}

describe("POST /sign-in/[token]/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSameOriginRequestMock.mockReturnValue(true);
    signInMagicLinkMock.mockResolvedValue({ status: true });
  });

  it("resends a link for an expired token", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "expired",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/resend", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(signInMagicLinkMock).toHaveBeenCalledWith({
      body: {
        email: "pilot@cmdclaw.ai",
        callbackURL: "/chat",
        newUserCallbackURL: "/welcome",
        errorCallbackURL: "/login?error=magic-link",
      },
      headers: expect.any(Headers),
    });
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://cmdclaw.ai/sign-in/abc123?resent=1");
  });

  it("does not resend for an invalid token", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "invalid",
      email: null,
      callbackUrl: null,
      newUserCallbackUrl: null,
      errorCallbackUrl: null,
    });

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/resend", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(signInMagicLinkMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://cmdclaw.ai/sign-in/abc123");
  });

  it("does not resend for a pending token", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "pending",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/resend", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(signInMagicLinkMock).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
  });
});
