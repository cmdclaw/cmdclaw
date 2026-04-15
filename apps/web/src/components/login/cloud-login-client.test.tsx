// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  signInMagicLink: vi.fn(),
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
  getLastUsedLoginMethod: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      magicLink: mocks.signInMagicLink,
      email: mocks.signInEmail,
      social: mocks.signInSocial,
    },
    getLastUsedLoginMethod: mocks.getLastUsedLoginMethod,
  },
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      children,
      variants: _v,
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...props
    }: React.ComponentProps<"div"> & Record<string, unknown>) => <div {...props}>{children}</div>,
  },
}));

import { CloudLoginClient } from "./cloud-login-client";

describe("CloudLoginClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLastUsedLoginMethod.mockReturnValue(null);
    mocks.signInMagicLink.mockResolvedValue({});
    mocks.signInEmail.mockResolvedValue({});
    mocks.signInSocial.mockResolvedValue({});
    mocks.fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    vi.stubGlobal("fetch", mocks.fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("signs in with the typed password email", async () => {
    render(<CloudLoginClient callbackUrl="/chat" />);

    // Step 1: enter email and continue
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "pilot@cmdclaw.ai" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Continue with email" }).closest("form")!);

    // Step 2: choose password method
    fireEvent.click(screen.getByRole("button", { name: "Use password" }));

    // Step 3: enter password and submit
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "hunter2hunter2" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    await waitFor(() => {
      expect(mocks.signInEmail).toHaveBeenCalledWith({
        email: "pilot@cmdclaw.ai",
        password: "hunter2hunter2",
        callbackURL: "/chat",
      });
    });
    expect(mocks.routerPush).toHaveBeenCalledWith("/chat");
  });

  it("requests a password setup email", async () => {
    render(<CloudLoginClient callbackUrl="/chat" />);

    // Step 1: enter email and continue
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "pilot@cmdclaw.ai" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Continue with email" }).closest("form")!);

    // Step 2: choose password method
    fireEvent.click(screen.getByRole("button", { name: "Use password" }));

    // Step 3: request a password email
    fireEvent.click(screen.getByRole("button", { name: "Create or reset password" }));

    await waitFor(() => {
      expect(mocks.fetchMock).toHaveBeenCalledWith("/api/auth/password/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "pilot@cmdclaw.ai",
          callbackUrl: "/chat",
        }),
      });
    });

    expect(screen.getByText("Password email sent")).toBeInTheDocument();
  });

  it("sends a magic link", async () => {
    render(<CloudLoginClient callbackUrl="/chat" />);

    // Step 1: enter email and continue
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "pilot@cmdclaw.ai" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Continue with email" }).closest("form")!);

    // Step 2: choose magic link
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    await waitFor(() => {
      expect(mocks.signInMagicLink).toHaveBeenCalledWith({
        email: "pilot@cmdclaw.ai",
        callbackURL: "/chat",
        newUserCallbackURL: "/chat",
        errorCallbackURL: "/login?error=magic-link",
      });
    });

    expect(screen.getByText("Check your inbox")).toBeInTheDocument();
  });
});
