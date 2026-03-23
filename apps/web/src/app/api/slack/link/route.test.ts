import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    insert: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

import { GET } from "./route";

function getLocation(response: Response) {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Expected redirect location");
  }
  return location;
}

describe("GET /api/slack/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    getSessionMock.mockResolvedValue(null);
  });

  it("uses APP_URL for login redirects when the request host is internal", async () => {
    process.env.APP_URL = "https://app.example.com";

    const response = await GET(
      new Request("https://0.0.0.0:8080/api/slack/link?slackUserId=U123&slackTeamId=T123"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://app.example.com/login?redirect=%2Fapi%2Fslack%2Flink%3FslackUserId%3DU123%26slackTeamId%3DT123",
    );
  });
});
