// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const {
  mockCreateCoworkerMutateAsync,
  mockUpdateCoworkerMutateAsync,
  mockDeleteCoworkerMutateAsync,
  mockTriggerCoworkerMutateAsync,
  mockGetOrCreateBuilderConversation,
  mockStartGeneration,
  mockToastSuccess,
  mockToastError,
  mockRouterPush,
} = vi.hoisted(() => ({
  mockCreateCoworkerMutateAsync: vi.fn(),
  mockUpdateCoworkerMutateAsync: vi.fn(),
  mockDeleteCoworkerMutateAsync: vi.fn(),
  mockTriggerCoworkerMutateAsync: vi.fn(),
  mockGetOrCreateBuilderConversation: vi.fn(),
  mockStartGeneration: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockRouterPush: vi.fn(),
}));

const mockLocationAssign = vi.fn();

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
  PromptBar: ({
    onSubmit,
    renderModelSelector,
  }: {
    onSubmit: (text: string) => void;
    renderModelSelector?: React.ReactNode;
  }) => {
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);

    React.useEffect(() => {
      const button = buttonRef.current;
      if (!button) {
        return;
      }

      const handleSubmit = () => onSubmit("Build me a coworker");
      button.addEventListener("click", handleSubmit);
      return () => button.removeEventListener("click", handleSubmit);
    }, [onSubmit]);

    return (
      <div>
        <div>{renderModelSelector}</div>
        <button ref={buttonRef} type="button">
          Submit prompt
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/chat/model-selector", () => ({
  ModelSelector: ({
    selectedModel,
    onSelectionChange,
  }: {
    selectedModel: string;
    onSelectionChange: (input: { model: string; authSource?: "user" | "shared" | null }) => void;
  }) => {
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);

    React.useEffect(() => {
      const button = buttonRef.current;
      if (!button) {
        return;
      }

      const handleChange = () =>
        onSelectionChange({ model: "openai/gpt-5.2-codex", authSource: "shared" });
      button.addEventListener("click", handleChange);
      return () => button.removeEventListener("click", handleChange);
    }, [onSelectionChange]);

    return (
      <button ref={buttonRef} type="button">
        Model selector: {selectedModel}
      </button>
    );
  },
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
      getOrCreateBuilderConversation: mockGetOrCreateBuilderConversation,
    },
    generation: {
      startGeneration: mockStartGeneration,
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
  useCreateCoworker: () => ({ mutateAsync: mockCreateCoworkerMutateAsync }),
  useTriggerCoworker: () => ({ mutateAsync: mockTriggerCoworkerMutateAsync }),
  useUpdateCoworker: () => ({ mutateAsync: mockUpdateCoworkerMutateAsync }),
  useDeleteCoworker: () => ({ mutateAsync: mockDeleteCoworkerMutateAsync }),
  useProviderAuthStatus: () => ({
    data: { connected: { openai: true }, shared: { openai: true } },
  }),
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mockCreateCoworkerMutateAsync.mockReset();
    mockUpdateCoworkerMutateAsync.mockReset();
    mockDeleteCoworkerMutateAsync.mockReset();
    mockTriggerCoworkerMutateAsync.mockReset();
    mockGetOrCreateBuilderConversation.mockReset();
    mockStartGeneration.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockRouterPush.mockReset();
    mockCreateCoworkerMutateAsync.mockResolvedValue({ id: "cw-new" });
    mockUpdateCoworkerMutateAsync.mockResolvedValue({ success: true });
    mockDeleteCoworkerMutateAsync.mockResolvedValue({ success: true });
    mockTriggerCoworkerMutateAsync.mockResolvedValue({ runId: "run-1" });
    mockGetOrCreateBuilderConversation.mockResolvedValue({ conversationId: "conv-1" });
    mockStartGeneration.mockResolvedValue({ generationId: "gen-1" });
    mockLocationAssign.mockReset();
    vi.stubGlobal("location", {
      ...window.location,
      assign: mockLocationAssign,
    });
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

  it("creates a coworker with the selected builder model", async () => {
    render(<CoworkersPage />);

    fireEvent.click(screen.getByRole("button", { name: /model selector:/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit prompt/i }));

    await waitFor(() => {
      expect(mockCreateCoworkerMutateAsync).toHaveBeenCalledWith({
        name: "",
        triggerType: "manual",
        prompt: "",
        model: "openai/gpt-5.2-codex",
        authSource: "shared",
        toolAccessMode: "all",
        allowedIntegrations: expect.any(Array),
      });
    });

    expect(mockStartGeneration).toHaveBeenCalledWith({
      conversationId: "conv-1",
      content: "Build me a coworker",
      model: "openai/gpt-5.2-codex",
      authSource: "shared",
      autoApprove: true,
    });
  });

  it("navigates to the created run when running a coworker from the card", async () => {
    render(<CoworkersPage />);

    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(mockTriggerCoworkerMutateAsync).toHaveBeenCalledWith({ id: "cw-1", payload: {} });
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/coworkers/runs/run-1");
  });
});
