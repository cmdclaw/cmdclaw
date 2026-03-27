import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { magicLinkVerifyMock } = vi.hoisted(() => ({
  magicLinkVerifyMock: vi.fn(),
}));

const { resolveMagicLinkPageStateMock, markMagicLinkRequestConsumedMock } = vi.hoisted(() => ({
  resolveMagicLinkPageStateMock: vi.fn(),
  markMagicLinkRequestConsumedMock: vi.fn(),
}));

const { isSameOriginRequestMock } = vi.hoisted(() => ({
  isSameOriginRequestMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      magicLinkVerify: magicLinkVerifyMock,
    },
  },
}));

vi.mock("@/server/lib/magic-link-request-state", () => ({
  resolveMagicLinkPageState: resolveMagicLinkPageStateMock,
  markMagicLinkRequestConsumed: markMagicLinkRequestConsumedMock,
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

describe("POST /sign-in/[token]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSameOriginRequestMock.mockReturnValue(true);
    markMagicLinkRequestConsumedMock.mockResolvedValue(undefined);
  });

  it("verifies a pending token, relays the Better Auth response, and marks it consumed", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "pending",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });
    magicLinkVerifyMock.mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: {
          location: "https://cmdclaw.ai/chat",
          "set-cookie": "better-auth.session_token=abc123; Path=/; HttpOnly",
        },
      }),
    );

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/confirm", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(magicLinkVerifyMock).toHaveBeenCalledWith({
      query: {
        token: "abc123",
        callbackURL: "/chat",
        newUserCallbackURL: "/welcome",
        errorCallbackURL: "/sign-in/abc123",
      },
      headers: expect.any(Headers),
      asResponse: true,
    });
    expect(markMagicLinkRequestConsumedMock).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://cmdclaw.ai/chat");
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token=abc123");
  });

  it("does not verify an expired token", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "expired",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/confirm", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(magicLinkVerifyMock).not.toHaveBeenCalled();
    expect(markMagicLinkRequestConsumedMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://cmdclaw.ai/sign-in/abc123");
  });

  it("does not verify an already used token", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "consumed",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/confirm", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(magicLinkVerifyMock).not.toHaveBeenCalled();
    expect(markMagicLinkRequestConsumedMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://cmdclaw.ai/sign-in/abc123");
  });

  it("turns an invalid Better Auth token result into the already-used state", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "pending",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });
    magicLinkVerifyMock.mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: {
          location: "https://cmdclaw.ai/sign-in/abc123?error=INVALID_TOKEN",
        },
      }),
    );

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/confirm", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(markMagicLinkRequestConsumedMock).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://cmdclaw.ai/sign-in/abc123");
  });

  it("redirects invite-only users to the request-access page", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "pending",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });
    magicLinkVerifyMock.mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: {
          location: "https://cmdclaw.ai/sign-in/abc123?error=invite_only",
        },
      }),
    );

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/confirm", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(markMagicLinkRequestConsumedMock).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://cmdclaw.ai/invite-only?email=pilot%40cmdclaw.ai&source=magic-link-confirm",
    );
  });

  it("redirects invite-only JSON auth errors to the request-access page", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "pending",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/welcome",
      errorCallbackUrl: "/login?error=magic-link",
    });
    magicLinkVerifyMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "invite_only", message: "invite_only" }), {
        status: 403,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await POST(
      new NextRequest("https://cmdclaw.ai/sign-in/abc123/confirm", { method: "POST" }),
      {
        params: Promise.resolve({ token: "abc123" }),
      },
    );

    expect(markMagicLinkRequestConsumedMock).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://cmdclaw.ai/invite-only?email=pilot%40cmdclaw.ai&source=magic-link-confirm",
    );
  });
});
