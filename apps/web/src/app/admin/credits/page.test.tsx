// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const {
  listUsersMock,
  manualTopUpMutateAsyncMock,
  refetchMock,
  useAdminBillingUserOverviewMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  listUsersMock: vi.fn(),
  manualTopUpMutateAsyncMock: vi.fn(),
  refetchMock: vi.fn().mockResolvedValue(undefined),
  useAdminBillingUserOverviewMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    admin: {
      listUsers: listUsersMock,
    },
  },
}));

vi.mock("@/orpc/hooks", () => ({
  useAdminBillingUserOverview: useAdminBillingUserOverviewMock,
  useAdminManualBillingTopUp: () => ({
    mutateAsync: manualTopUpMutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

import AdminCreditsPage from "./page";

describe("AdminCreditsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    refetchMock.mockResolvedValue(undefined);
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    manualTopUpMutateAsyncMock.mockResolvedValue({
      id: "topup-1",
      creditsGranted: 2500,
      expiresAt: new Date("2027-03-10T10:00:00.000Z"),
    });
    useAdminBillingUserOverviewMock.mockImplementation((targetUserId: string | null) => {
      if (targetUserId === "user-1") {
        return {
          data: {
            targetUser: {
              id: "user-1",
              name: "Alice",
              email: "alice@example.com",
            },
            activeWorkspace: {
              id: "ws-1",
              name: "Alice Workspace",
              slug: "alice-workspace",
            },
            plan: {
              id: "pro",
              name: "Pro",
            },
            feature: {
              balance: 1200,
              breakdown: [{ interval: "one_off", balance: 300 }],
            },
            recentTopUps: [
              {
                id: "topup-1",
                usdAmount: 25,
                creditsGranted: 2500,
                createdAt: "2026-03-10T10:00:00.000Z",
                expiresAt: "2027-03-10T10:00:00.000Z",
              },
            ],
          },
          isLoading: false,
          error: null,
          refetch: refetchMock,
        };
      }

      if (targetUserId === "user-2") {
        return {
          data: {
            targetUser: {
              id: "user-2",
              name: "Bob",
              email: "bob@example.com",
            },
            activeWorkspace: null,
            plan: null,
            feature: null,
            recentTopUps: [],
          },
          isLoading: false,
          error: null,
          refetch: refetchMock,
        };
      }

      return {
        data: undefined,
        isLoading: false,
        error: null,
        refetch: refetchMock,
      };
    });
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          { id: "user-1", name: "Alice", email: "alice@example.com", role: "member" },
          { id: "user-2", name: "Bob", email: "bob@example.com", role: "member" },
        ],
      },
      error: null,
    });
  });

  it("loads the default user list and selected user's billing details", async () => {
    render(<AdminCreditsPage />);

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenCalledTimes(1);
    });

    expect(listUsersMock).toHaveBeenCalledWith({
      query: expect.objectContaining({
        searchValue: undefined,
        searchField: "email",
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: /alice@example\.com/i }));

    expect(screen.getByText("Alice Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Top-up bal\./i)).toBeInTheDocument();
    expect(screen.getByText(/Recent Top-Ups/i)).toBeInTheDocument();
  });

  it("submits email search and refreshes the user list", async () => {
    listUsersMock
      .mockResolvedValueOnce({
        data: {
          users: [
            { id: "user-1", name: "Alice", email: "alice@example.com", role: "member" },
            { id: "user-2", name: "Bob", email: "bob@example.com", role: "member" },
          ],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: "user-2", name: "Bob", email: "bob@example.com", role: "member" }],
        },
        error: null,
      });

    render(<AdminCreditsPage />);

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenCalledTimes(1);
    });

    const searchInput = screen.getByPlaceholderText(/search by email/i);
    fireEvent.change(searchInput, {
      target: { value: "bob" },
    });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenLastCalledWith({
        query: expect.objectContaining({
          searchValue: "bob",
        }),
      });
    });

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenCalledTimes(2);
      expect(screen.getAllByText(/bob@example\.com/i).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /bob@example\.com/i }));

    await waitFor(() => {
      expect(screen.getByText("None")).toBeInTheDocument();
    });
  });

  it("disables top-up when the selected user has no active workspace", async () => {
    render(<AdminCreditsPage />);

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /bob@example.com/i }));

    await waitFor(() => {
      expect(screen.getByText("None")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /^grant$/i })).toBeDisabled();
  });

  it("shows success feedback and refetches after a top-up", async () => {
    render(<AdminCreditsPage />);

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /alice@example\.com/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice Workspace")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^grant$/i }));

    await waitFor(() => {
      expect(manualTopUpMutateAsyncMock).toHaveBeenCalledWith({
        targetUserId: "user-1",
        usdAmount: 25,
      });
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Granted 2,500 credits to alice@example.com.");
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows toast errors when the top-up request fails", async () => {
    manualTopUpMutateAsyncMock.mockRejectedValueOnce(new Error("Grant failed."));

    render(<AdminCreditsPage />);

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /alice@example\.com/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice Workspace")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^grant$/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Grant failed.");
    });
  });
});
