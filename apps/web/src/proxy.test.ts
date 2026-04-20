import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy", () => {
  afterEach(() => {
    delete process.env.CMDCLAW_INSTANCE_ROOT;
  });

  it("redirects unauthenticated protected routes to login by default", () => {
    const response = proxy(new NextRequest("http://127.0.0.1:3626/chat?tab=latest"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3626/login?callbackUrl=%2Fchat%3Ftab%3Dlatest",
    );
  });

  it("redirects unauthenticated protected routes to worktree auto-login when configured", () => {
    process.env.CMDCLAW_INSTANCE_ROOT = "/tmp/cmdclaw-worktree";

    const response = proxy(new NextRequest("http://127.0.0.1:3626/chat?tab=latest"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3626/api/dev/worktree-auth?callbackUrl=%2Fchat%3Ftab%3Dlatest",
    );
  });
});
