import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  exchangeCloudAccountLinkMock,
  getCloudManagedIntegrationConnectUrlMock,
  consumeCloudAccountLinkStateMock,
  upsertCloudAccountLinkForUserMock,
  getSessionMock,
} = vi.hoisted(() => ({
  exchangeCloudAccountLinkMock: vi.fn(),
  getCloudManagedIntegrationConnectUrlMock: vi.fn(),
  consumeCloudAccountLinkStateMock: vi.fn(),
  upsertCloudAccountLinkForUserMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("@cmdclaw/core/server/control-plane/client", () => ({
  exchangeCloudAccountLink: exchangeCloudAccountLinkMock,
  getCloudManagedIntegrationConnectUrl: getCloudManagedIntegrationConnectUrlMock,
}));

vi.mock("@cmdclaw/core/server/control-plane/local-links", () => ({
  consumeCloudAccountLinkState: consumeCloudAccountLinkStateMock,
  upsertCloudAccountLinkForUser: upsertCloudAccountLinkForUserMock,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

import { GET } from "./route";

function getLocation(response: Response) {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Expected redirect location");
  }
  return location;
}

describe("GET /api/control-plane/link/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    consumeCloudAccountLinkStateMock.mockResolvedValue({
      state: "state-1",
      returnPath: "/toolbox",
      requestedIntegrationType: null,
    });
    exchangeCloudAccountLinkMock.mockResolvedValue("cloud-user-1");
  });

  it("uses APP_URL for login redirects when the request host is internal", async () => {
    process.env.APP_URL = "https://app.example.com";
    getSessionMock.mockResolvedValue(null);

    const response = await GET(
      new Request("https://0.0.0.0:8080/api/control-plane/link/callback?code=code-1&state=state-1"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://app.example.com/login?callbackUrl=%2Fapi%2Fcontrol-plane%2Flink%2Fcallback%3Fcode%3Dcode-1%26state%3Dstate-1",
    );
  });

  it("normalizes internal return paths to APP_URL", async () => {
    process.env.APP_URL = "https://app.example.com";
    consumeCloudAccountLinkStateMock.mockResolvedValue({
      state: "state-1",
      returnPath: "https://0.0.0.0:8080/toolbox",
      requestedIntegrationType: null,
    });

    const response = await GET(
      new Request("https://0.0.0.0:8080/api/control-plane/link/callback?code=code-1&state=state-1"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("https://app.example.com/toolbox?cloudLinked=1");
  });
});
