// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  resetPassword: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    resetPassword: mocks.resetPassword,
  },
}));

import ResetPasswordPage from "./page";

describe("/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.resetPassword.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("resets the password and redirects to the callbackUrl", async () => {
    mocks.searchParams = new URLSearchParams("token=token-1&callbackUrl=%2Fchat");

    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "new-password-123" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Set password" }).closest("form")!);

    await waitFor(() => {
      expect(mocks.resetPassword).toHaveBeenCalledWith({
        token: "token-1",
        newPassword: "new-password-123",
      });
    });
    expect(mocks.routerPush).toHaveBeenCalledWith("/chat");
  });

  it("shows the invalid token state", () => {
    mocks.searchParams = new URLSearchParams("error=INVALID_TOKEN");

    render(<ResetPasswordPage />);

    expect(screen.getByRole("heading", { name: "Invalid password link" })).toBeInTheDocument();
    expect(
      screen.getByText("This password link is invalid or has already been used."),
    ).toBeInTheDocument();
  });

  it("shows the expired token state", () => {
    mocks.searchParams = new URLSearchParams("error=EXPIRED_TOKEN");

    render(<ResetPasswordPage />);

    expect(screen.getByRole("heading", { name: "Expired password link" })).toBeInTheDocument();
    expect(
      screen.getAllByText("This password link expired. Request a new one from the login page."),
    ).toHaveLength(2);
  });
});
