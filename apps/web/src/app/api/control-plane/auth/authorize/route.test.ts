import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCloudSessionMock, getValidAuthRequestMock, updateWhereMock, assertCloudMock } =
  vi.hoisted(() => {
    const requireCloudSessionMock = vi.fn();
    const getValidAuthRequestMock = vi.fn();
    const updateWhereMock = vi.fn();
    const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
    const updateMock = vi.fn(() => ({ set: updateSetMock }));
    const assertCloudMock = vi.fn();

    return {
      requireCloudSessionMock,
      getValidAuthRequestMock,
      updateWhereMock,
      assertCloudMock,
      dbMock: {
        update: updateMock,
      },
    };
  });

vi.mock("@/server/control-plane/auth", () => ({
  assertCloudControlPlaneEnabled: assertCloudMock,
  getValidAuthRequest: getValidAuthRequestMock,
  requireCloudSession: requireCloudSessionMock,
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhereMock })),
    })),
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

describe("GET /api/control-plane/auth/authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getValidAuthRequestMock.mockResolvedValue({
      code: "code-1",
      localState: "state-1",
      returnUrl: "http://selfhost.local/api/control-plane/auth/callback",
      createdAt: new Date(),
    });
  });

  it("redirects to cloud login when there is no cloud session", async () => {
    requireCloudSessionMock.mockResolvedValue(null);

    const response = await GET(
      new Request("https://cloud.example.com/api/control-plane/auth/authorize?code=code-1"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://cloud.example.com/login?callbackUrl=%2Fapi%2Fcontrol-plane%2Fauth%2Fauthorize%3Fcode%3Dcode-1",
    );
  });

  it("redirects back to self-host with code and state after cloud login", async () => {
    requireCloudSessionMock.mockResolvedValue({ user: { id: "cloud-user-1" } });

    const response = await GET(
      new Request("https://cloud.example.com/api/control-plane/auth/authorize?code=code-1"),
    );

    expect(updateWhereMock).toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "http://selfhost.local/api/control-plane/auth/callback?code=code-1&state=state-1",
    );
  });
});
