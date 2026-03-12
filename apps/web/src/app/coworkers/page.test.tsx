// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const {
  mockUpdateCoworkerMutateAsync,
  mockDeleteCoworkerMutateAsync,
  mockToastSuccess,
  mockToastError,
  mockRouterPush,
} = vi.hoisted(() => ({
  mockUpdateCoworkerMutateAsync: vi.fn(),
  mockDeleteCoworkerMutateAsync: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockRouterPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <div>{alt}</div>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/chat/voice-indicator", () => ({
  VoiceIndicator: () => <div>Voice indicator</div>,
}));

vi.mock("@/components/prompt-bar", () => ({
  PromptBar: () => <div>Prompt bar</div>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    asChild,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    asChild?: boolean;
  }) => {
    if (asChild) {
      return children;
    }
    return (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onSelect} disabled={disabled}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <div />,
}));

vi.mock("@/hooks/use-voice-recording", () => ({
  blobToBase64: vi.fn(),
  useVoiceRecording: () => ({
    isRecording: false,
    error: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));

vi.mock("@/orpc/client", () => ({
  client: {
    coworker: {
      getOrCreateBuilderConversation: vi.fn(),
    },
    generation: {
      startGeneration: vi.fn(),
    },
  },
}));

vi.mock("@/orpc/hooks", () => ({
  useCoworkerList: () => ({
    data: [
      {
        id: "cw-1",
        name: "Inbox triage",
        username: "inbox-triage",
        description: "Sort and summarize inbound work.",
        status: "on",
        triggerType: "manual",
        toolAccessMode: "all",
        allowedIntegrations: [],
        allowedSkillSlugs: [],
        recentRuns: [],
      },
    ],
    isLoading: false,
  }),
  useIntegrationList: () => ({ data: [] }),
  useCreateCoworker: () => ({ mutateAsync: vi.fn() }),
  useTriggerCoworker: () => ({ mutateAsync: vi.fn() }),
  useUpdateCoworker: () => ({ mutateAsync: mockUpdateCoworkerMutateAsync }),
  useDeleteCoworker: () => ({ mutateAsync: mockDeleteCoworkerMutateAsync }),
  useTranscribe: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

import CoworkersPage from "./page";

describe("CoworkersPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockUpdateCoworkerMutateAsync.mockReset();
    mockDeleteCoworkerMutateAsync.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockRouterPush.mockReset();
    mockUpdateCoworkerMutateAsync.mockResolvedValue({ success: true });
    mockDeleteCoworkerMutateAsync.mockResolvedValue({ success: true });
  });

  it("turns off a coworker from the card context menu", async () => {
    render(<CoworkersPage />);

    fireEvent.click(screen.getByRole("button", { name: /turn off/i }));

    await waitFor(() => {
      expect(mockUpdateCoworkerMutateAsync).toHaveBeenCalledWith({
        id: "cw-1",
        status: "off",
      });
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Coworker turned off.");
  });

  it("deletes a coworker from the card context menu after confirmation", async () => {
    render(<CoworkersPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /delete coworker/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockDeleteCoworkerMutateAsync).toHaveBeenCalledWith("cw-1");
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Coworker deleted.");
  });
});
