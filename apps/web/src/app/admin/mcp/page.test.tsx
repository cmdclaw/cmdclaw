// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const {
  addGalienAccessMutateAsyncMock,
  removeGalienAccessMutateAsyncMock,
  updateGalienAccessTargetEnvMutateAsyncMock,
} = vi.hoisted(() => ({
  addGalienAccessMutateAsyncMock: vi.fn(),
  removeGalienAccessMutateAsyncMock: vi.fn(),
  updateGalienAccessTargetEnvMutateAsyncMock: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: () => <span data-testid="next-image" />,
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
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: () => null,
}));

vi.mock("@/orpc/hooks", () => ({
  useModulrStatus: () => ({
    data: { connected: false, allowed: true },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useAdminWorkspaces: () => ({
    data: [{ id: "workspace-1", name: "Workspace 1" }],
  }),
  useTestModulrConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConnectModulr: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDisconnectModulr: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAdminGalienAccess: () => ({
    data: [
      {
        id: "galien-access-1",
        email: "preprod@example.com",
        targetEnv: "preprod",
      },
    ],
    isLoading: false,
  }),
  useAdminAddGalienAccess: () => ({
    mutateAsync: addGalienAccessMutateAsyncMock,
    isPending: false,
  }),
  useAdminRemoveGalienAccess: () => ({
    mutateAsync: removeGalienAccessMutateAsyncMock,
    isPending: false,
  }),
  useAdminUpdateGalienAccessTargetEnv: () => ({
    mutateAsync: updateGalienAccessTargetEnvMutateAsyncMock,
    isPending: false,
  }),
  useAdminModulrAccess: () => ({
    data: [],
    isLoading: false,
  }),
  useAdminAddModulrAccess: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAdminRemoveModulrAccess: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import AdminMcpPage from "./page";

describe("AdminMcpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("adds Galien access with the selected target environment", async () => {
    addGalienAccessMutateAsyncMock.mockResolvedValueOnce({
      id: "galien-access-2",
      email: "user@example.com",
      targetEnv: "preprod",
    });

    render(<AdminMcpPage />);

    const galienForm = screen.getByRole("button", { name: "Add Galien" }).closest("form");
    expect(galienForm).not.toBeNull();
    fireEvent.change(within(galienForm as HTMLElement).getByPlaceholderText("user@company.com"), {
      target: { value: "User@Example.com " },
    });
    fireEvent.change(
      within(galienForm as HTMLElement).getByLabelText("Galien target environment"),
      {
        target: { value: "preprod" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Galien" }));

    await waitFor(() => {
      expect(addGalienAccessMutateAsyncMock).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        email: "user@example.com",
        targetEnv: "preprod",
      });
    });
  });

  it("updates the target environment for an existing Galien access entry", async () => {
    updateGalienAccessTargetEnvMutateAsyncMock.mockResolvedValueOnce({
      id: "galien-access-1",
      email: "preprod@example.com",
      targetEnv: "prod",
    });

    render(<AdminMcpPage />);

    fireEvent.change(screen.getByLabelText("Galien target environment for preprod@example.com"), {
      target: { value: "prod" },
    });

    await waitFor(() => {
      expect(updateGalienAccessTargetEnvMutateAsyncMock).toHaveBeenCalledWith({
        id: "galien-access-1",
        workspaceId: "workspace-1",
        targetEnv: "prod",
      });
    });
  });
});
