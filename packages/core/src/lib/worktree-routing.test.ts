import { describe, expect, it } from "vitest";
import {
  buildWorktreePublicCallbackBaseUrl,
  DEFAULT_LOCALCAN_CALLBACK_BASE_URL,
  matchWorktreePublicRoute,
  resolvePublicCallbackBaseUrl,
} from "./worktree-routing";

describe("worktree-routing", () => {
  it("falls back to localcan for loopback development app urls", () => {
    expect(
      resolvePublicCallbackBaseUrl({
        appUrl: "http://127.0.0.1:3000",
        nodeEnv: "development",
      }),
    ).toBe(DEFAULT_LOCALCAN_CALLBACK_BASE_URL);
  });

  it("prefers explicit public callback bases", () => {
    expect(
      resolvePublicCallbackBaseUrl({
        callbackBaseUrl: "https://example.com/callbacks",
        appUrl: "http://127.0.0.1:3000",
        nodeEnv: "development",
      }),
    ).toBe("https://example.com/callbacks");
  });

  it("builds worktree-scoped public callback urls", () => {
    expect(
      buildWorktreePublicCallbackBaseUrl({
        instanceId: "cmdclaw-a07527aa",
        appUrl: "http://127.0.0.1:3711",
        nodeEnv: "development",
      }),
    ).toBe("https://localcan.baptistecolle.com/__worktrees/cmdclaw-a07527aa");
  });

  it("preserves existing public base paths when adding worktree routing", () => {
    expect(
      buildWorktreePublicCallbackBaseUrl({
        instanceId: "cmdclaw-a07527aa",
        callbackBaseUrl: "https://example.com/cmdclaw",
      }),
    ).toBe("https://example.com/cmdclaw/__worktrees/cmdclaw-a07527aa");
  });

  it("matches worktree public routes and strips the prefix", () => {
    expect(matchWorktreePublicRoute("/__worktrees/cmdclaw-a07527aa/api/internal/runtime")).toEqual(
      {
        instanceId: "cmdclaw-a07527aa",
        forwardedPath: "/api/internal/runtime",
      },
    );
    expect(matchWorktreePublicRoute("/__worktrees/cmdclaw-a07527aa")).toEqual({
      instanceId: "cmdclaw-a07527aa",
      forwardedPath: "/",
    });
  });
});
