// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const {
  mockRouterPush,
  addApprovedLoginEntryMutateAsyncMock,
  removeApprovedLoginEntryMutateAsyncMock,
  resetOnboardingMutateAsyncMock,
  addAllowlistEntryMutateAsyncMock,
  removeAllowlistEntryMutateAsyncMock,
  setDisplayAdvancedMetricsMock,
  adminExecutorManagerPropsMock,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  addApprovedLoginEntryMutateAsyncMock: vi.fn(),
  removeApprovedLoginEntryMutateAsyncMock: vi.fn(),
  resetOnboardingMutateAsyncMock: vi.fn(),
  addAllowlistEntryMutateAsyncMock: vi.fn(),
  removeAllowlistEntryMutateAsyncMock: vi.fn(),
  setDisplayAdvancedMetricsMock: vi.fn(),
  adminExecutorManagerPropsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
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

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode; value: string }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/admin/executor-sources-manager", () => ({
  ExecutorSourcesManager: (props: unknown) => {
    adminExecutorManagerPropsMock(props);
    return <div>Executor Sources Manager</div>;
  },
}));

vi.mock("@/components/chat/chat-advanced-settings-store", () => ({
  useChatAdvancedSettingsStore: (
    selector: (state: {
      displayAdvancedMetrics: boolean;
      setDisplayAdvancedMetrics: (checked: boolean) => void;
    }) => unknown,
  ) =>
    selector({
      displayAdvancedMetrics: false,
      setDisplayAdvancedMetrics: setDisplayAdvancedMetricsMock,
    }),
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
  useResetOnboarding: () => ({
    mutateAsync: resetOnboardingMutateAsyncMock,
    isPending: false,
  }),
  useAdminWorkspaces: () => ({
    data: [
      { id: "workspace-1", name: "Workspace One" },
      { id: "workspace-2", name: "Workspace Two" },
    ],
    isLoading: false,
  }),
  useAdminExecutorSourceList: () => ({
    data: { sources: [], packageRevisionHash: null },
    isLoading: false,
  }),
  useAdminCreateExecutorSource: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useAdminUpdateExecutorSource: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useAdminDeleteExecutorSource: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useAdminSetExecutorSourceCredential: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useAdminDisconnectExecutorSourceCredential: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useAdminToggleExecutorSourceCredential: () => ({
    mutateAsync: vi.fn(),
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
    resetOnboardingMutateAsyncMock.mockResolvedValue({ success: true });
  });

  it("resets onboarding for the current user and redirects to onboarding", async () => {
    render(<AdminPage />);

    fireEvent.click(screen.getByRole("button", { name: "Reset my onboarding" }));

    await waitFor(() => {
      expect(resetOnboardingMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/onboarding/subscriptions");
  });

  it("shows an inline error when onboarding reset fails", async () => {
    resetOnboardingMutateAsyncMock.mockRejectedValueOnce(new Error("Reset failed."));

    render(<AdminPage />);

    fireEvent.click(screen.getByRole("button", { name: "Reset my onboarding" }));

    expect(await screen.findByText("Reset failed.")).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
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

  it("shows executor sources on admin with a workspace selector", () => {
    render(<AdminPage />);

    expect(screen.getByText("Executor Sources")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Workspace One")).toBeInTheDocument();
    expect(screen.getByText("Executor Sources Manager")).toBeInTheDocument();
    expect(adminExecutorManagerPropsMock).toHaveBeenCalled();
  });
});
