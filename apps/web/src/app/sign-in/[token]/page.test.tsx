// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveMagicLinkPageStateMock } = vi.hoisted(() => ({
  resolveMagicLinkPageStateMock: vi.fn(),
}));

vi.mock("@/server/lib/magic-link-request-state", () => ({
  resolveMagicLinkPageState: resolveMagicLinkPageStateMock,
}));

import SignInTokenPage from "./page";

describe("/sign-in/[token] page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the valid token state with a continue button", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "pending",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/chat",
      errorCallbackUrl: "/login?error=magic-link",
    });

    render(
      await SignInTokenPage({
        params: Promise.resolve({ token: "abc123" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "Confirm sign-in" })).not.toBeNull();
    expect(screen.getByText("pilot@cmdclaw.ai")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeNull();
  });

  it("shows the expired token state with resend", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "expired",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/chat",
      errorCallbackUrl: "/login?error=magic-link",
    });

    render(
      await SignInTokenPage({
        params: Promise.resolve({ token: "abc123" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "Link expired" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Resend link" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("shows the already used state with resend", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "consumed",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/chat",
      errorCallbackUrl: "/login?error=magic-link",
    });

    render(
      await SignInTokenPage({
        params: Promise.resolve({ token: "abc123" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "Link already used" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Resend link" })).not.toBeNull();
  });

  it("shows the invalid link state with a login link", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "invalid",
      email: null,
      callbackUrl: null,
      newUserCallbackUrl: null,
      errorCallbackUrl: null,
    });

    render(
      await SignInTokenPage({
        params: Promise.resolve({ token: "abc123" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "Invalid link" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to login" }).getAttribute("href")).toBe("/login");
  });

  it("shows a resend confirmation banner", async () => {
    resolveMagicLinkPageStateMock.mockResolvedValue({
      status: "consumed",
      email: "pilot@cmdclaw.ai",
      callbackUrl: "/chat",
      newUserCallbackUrl: "/chat",
      errorCallbackUrl: "/login?error=magic-link",
    });

    render(
      await SignInTokenPage({
        params: Promise.resolve({ token: "abc123" }),
        searchParams: Promise.resolve({ resent: "1" }),
      }),
    );

    expect(screen.getByText("We sent a new sign-in link to pilot@cmdclaw.ai.")).not.toBeNull();
  });
});
