import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  isControlPlaneEnabledMock,
  consumeControlPlaneAuthStateMock,
  exchangeCloudAuthMock,
  resolveOrCreateLocalUserMock,
  createLocalSessionRedirectResponseMock,
} = vi.hoisted(() => ({
  isControlPlaneEnabledMock: vi.fn(),
  consumeControlPlaneAuthStateMock: vi.fn(),
  exchangeCloudAuthMock: vi.fn(),
  resolveOrCreateLocalUserMock: vi.fn(),
  createLocalSessionRedirectResponseMock: vi.fn(),
}));

vi.mock("@cmdclaw/core/server/control-plane/client", () => ({
  exchangeCloudAuth: exchangeCloudAuthMock,
  isControlPlaneEnabled: isControlPlaneEnabledMock,
}));

vi.mock("@cmdclaw/core/server/control-plane/local-auth", () => ({
  consumeControlPlaneAuthState: consumeControlPlaneAuthStateMock,
}));

vi.mock("@/server/control-plane/selfhost-auth", () => ({
  resolveOrCreateLocalUserFromCloudIdentity: resolveOrCreateLocalUserMock,
  createLocalSessionRedirectResponse: createLocalSessionRedirectResponseMock,
}));

import { GET } from "./route";

function getLocation(response: Response) {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Expected redirect location");
  }
  return location;
}

describe("GET /api/control-plane/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    isControlPlaneEnabledMock.mockReturnValue(true);
    consumeControlPlaneAuthStateMock.mockResolvedValue({
      state: "state-1",
      returnPath: "/chat",
      createdAt: new Date(),
    });
    exchangeCloudAuthMock.mockResolvedValue({
      cloudUserId: "cloud-user-1",
      email: "user@example.com",
      name: "Cloud User",
      image: null,
    });
    resolveOrCreateLocalUserMock.mockResolvedValue("local-user-1");
    createLocalSessionRedirectResponseMock.mockImplementation(
      async ({ redirectUrl }: { redirectUrl: URL }) => NextResponse.redirect(redirectUrl),
    );
  });

  it("redirects back to login when the local state is invalid", async () => {
    consumeControlPlaneAuthStateMock.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://selfhost.local/api/control-plane/auth/callback?code=code-1&state=state-1",
      ),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "http://selfhost.local/login?callbackUrl=%2Fchat&error=invalid_state",
    );
  });

  it("uses APP_URL for login redirects when the request host is internal", async () => {
    process.env.APP_URL = "https://app.example.com";
    consumeControlPlaneAuthStateMock.mockResolvedValue(null);

    const response = await GET(
      new Request("https://0.0.0.0:8080/api/control-plane/auth/callback?code=code-1&state=state-1"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://app.example.com/login?callbackUrl=%2Fchat&error=invalid_state",
    );
  });

  it("creates a local session and redirects to the requested page", async () => {
    const response = await GET(
      new Request(
        "http://selfhost.local/api/control-plane/auth/callback?code=code-1&state=state-1",
      ),
    );

    expect(exchangeCloudAuthMock).toHaveBeenCalledWith("code-1");
    expect(resolveOrCreateLocalUserMock).toHaveBeenCalledWith({
      cloudUserId: "cloud-user-1",
      email: "user@example.com",
      name: "Cloud User",
      image: null,
    });
    expect(createLocalSessionRedirectResponseMock).toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("http://selfhost.local/chat");
  });

  it("uses APP_URL for the post-login redirect when the request host is internal", async () => {
    process.env.APP_URL = "https://app.example.com";

    const response = await GET(
      new Request("https://0.0.0.0:8080/api/control-plane/auth/callback?code=code-1&state=state-1"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://app.example.com/chat");
  });
});
