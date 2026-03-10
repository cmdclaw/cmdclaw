import { beforeEach, describe, expect, it, vi } from "vitest";

const { getValidAuthRequestMock, updateWhereMock, assertInstanceKeyMock, userFindFirstMock } =
  vi.hoisted(() => {
    const getValidAuthRequestMock = vi.fn();
    const updateWhereMock = vi.fn();
    const userFindFirstMock = vi.fn();
    const assertInstanceKeyMock = vi.fn();

    return {
      getValidAuthRequestMock,
      updateWhereMock,
      assertInstanceKeyMock,
      userFindFirstMock,
      dbMock: {
        query: {
          user: {
            findFirst: userFindFirstMock,
          },
        },
        update: vi.fn(() => ({
          set: vi.fn(() => ({ where: updateWhereMock })),
        })),
      },
    };
  });

vi.mock("@/server/control-plane/auth", () => ({
  assertValidInstanceApiKey: assertInstanceKeyMock,
  getValidAuthRequest: getValidAuthRequestMock,
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    query: {
      user: {
        findFirst: userFindFirstMock,
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhereMock })),
    })),
  },
}));

import { POST } from "./route";

describe("POST /api/control-plane/auth/exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getValidAuthRequestMock.mockResolvedValue({
      code: "code-1",
      completedByUserId: "cloud-user-1",
      completedAt: null,
      createdAt: new Date(),
    });
    userFindFirstMock.mockResolvedValue({
      id: "cloud-user-1",
      email: "user@example.com",
      name: "Cloud User",
      image: "https://example.com/avatar.png",
    });
  });

  it("returns cloud identity payload for a completed auth request", async () => {
    const response = await POST(
      new Request("https://cloud.example.com/api/control-plane/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "code-1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cloudUserId: "cloud-user-1",
      email: "user@example.com",
      name: "Cloud User",
      image: "https://example.com/avatar.png",
    });
  });

  it("rejects incomplete auth requests", async () => {
    getValidAuthRequestMock.mockResolvedValue({
      code: "code-1",
      completedByUserId: null,
      completedAt: null,
      createdAt: new Date(),
    });

    const response = await POST(
      new Request("https://cloud.example.com/api/control-plane/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "code-1" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid or incomplete code" });
  });
});
