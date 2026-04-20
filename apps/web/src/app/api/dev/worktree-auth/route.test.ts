import { beforeEach, describe, expect, it, vi } from "vitest";

const { existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

import { GET } from "./route";

function getLocation(response: Response) {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Expected redirect location");
  }
  return location;
}

describe("GET /api/dev/worktree-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CMDCLAW_INSTANCE_ROOT;
    existsSyncMock.mockReturnValue(false);
  });

  it("falls back to login when worktree auto-login is unavailable", async () => {
    const response = await GET(
      new Request("http://127.0.0.1:3626/api/dev/worktree-auth?callbackUrl=%2Fchat"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "http://127.0.0.1:3626/login?callbackUrl=%2Fchat&error=worktree_auto_login_unavailable",
    );
  });

  it("sets the bootstrapped session cookie and redirects back to the callback", async () => {
    process.env.CMDCLAW_INSTANCE_ROOT = "/tmp/cmdclaw-worktree";
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        cookies: [
          {
            name: "better-auth.session_token",
            value: "signed-cookie%2Fvalue%3D",
            expires: 1_900_000_000,
            httpOnly: true,
            sameSite: "Lax",
          },
        ],
      }),
    );

    const response = await GET(
      new Request("http://127.0.0.1:3626/api/dev/worktree-auth?callbackUrl=%2Fchat"),
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe("http://127.0.0.1:3626/chat");
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token=signed-cookie%2Fvalue%3D",
    );
  });
});
