import { beforeEach, describe, expect, it, vi } from "vitest";

const { startCloudAuthMock, isSelfHostedEditionMock } = vi.hoisted(() => ({
  startCloudAuthMock: vi.fn(),
  isSelfHostedEditionMock: vi.fn(),
}));

vi.mock("@cmdclaw/core/server/control-plane/client", () => ({
  startCloudAuth: startCloudAuthMock,
}));

vi.mock("@cmdclaw/core/server/edition", () => ({
  isSelfHostedEdition: isSelfHostedEditionMock,
}));

import { GET } from "./route";

function getLocation(response: Response) {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Expected redirect location");
  }
  return location;
}

describe("GET /api/instance/auth/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSelfHostedEditionMock.mockReturnValue(true);
    startCloudAuthMock.mockResolvedValue(
      "https://cloud.example.com/api/control-plane/auth/authorize?code=code-1",
    );
  });

  it("redirects to cloud auth for self-hosted login", async () => {
    const response = await GET(
      new Request("http://selfhost.local/api/instance/auth/start?callbackUrl=%2Fchat"),
    );

    expect(startCloudAuthMock).toHaveBeenCalledWith({ returnPath: "/chat" });
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://cloud.example.com/api/control-plane/auth/authorize?code=code-1",
    );
  });

  it("redirects back to login when self-hosted auth is unavailable", async () => {
    isSelfHostedEditionMock.mockReturnValue(false);

    const response = await GET(
      new Request("http://selfhost.local/api/instance/auth/start?callbackUrl=%2Fchat"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "http://selfhost.local/login?callbackUrl=%2Fchat&error=cloud_auth_not_available",
    );
  });
});
