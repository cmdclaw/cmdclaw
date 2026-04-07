// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const {
  addApprovedLoginEntryMutateAsyncMock,
  removeApprovedLoginEntryMutateAsyncMock,
  addAllowlistEntryMutateAsyncMock,
  removeAllowlistEntryMutateAsyncMock,
} = vi.hoisted(() => ({
  addApprovedLoginEntryMutateAsyncMock: vi.fn(),
  removeApprovedLoginEntryMutateAsyncMock: vi.fn(),
  addAllowlistEntryMutateAsyncMock: vi.fn(),
  removeAllowlistEntryMutateAsyncMock: vi.fn(),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    type = "button",
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/orpc/hooks", () => ({
  useApprovedLoginEmailAllowlist: () => ({
    data: [
      {
        id: "builtin:baptiste@heybap.com",
        email: "baptiste@heybap.com",
        createdByUserId: null,
        createdAt: null,
        isBuiltIn: true,
      },
    ],
    isLoading: false,
    error: null,
  }),
  useAddApprovedLoginEmailAllowlistEntry: () => ({
    mutateAsync: addApprovedLoginEntryMutateAsyncMock,
    isPending: false,
  }),
  useRemoveApprovedLoginEmailAllowlistEntry: () => ({
    mutateAsync: removeApprovedLoginEntryMutateAsyncMock,
    isPending: false,
  }),
  useGoogleAccessAllowlist: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
  useAddGoogleAccessAllowlistEntry: () => ({
    mutateAsync: addAllowlistEntryMutateAsyncMock,
    isPending: false,
  }),
  useRemoveGoogleAccessAllowlistEntry: () => ({
    mutateAsync: removeAllowlistEntryMutateAsyncMock,
    isPending: false,
  }),
}));

import AdminPage from "./page";

describe("AdminPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the invite-only waitlist emails", () => {
    render(<AdminPage />);

    expect(screen.getByText("Approved Login Emails")).toBeInTheDocument();
    expect(screen.getByText("baptiste@heybap.com")).toBeInTheDocument();
  });

  it("adds an approved login email", async () => {
    addApprovedLoginEntryMutateAsyncMock.mockResolvedValueOnce({
      id: "entry-1",
      email: "user@example.com",
      createdByUserId: "admin-1",
      createdAt: new Date(),
      isBuiltIn: false,
    });

    render(<AdminPage />);

    const inputs = screen.getAllByPlaceholderText("user@company.com");
    fireEvent.change(inputs[0], { target: { value: "User@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Add approved email" }));

    await waitFor(() => {
      expect(addApprovedLoginEntryMutateAsyncMock).toHaveBeenCalledWith({
        email: "user@example.com",
      });
    });
  });
});
