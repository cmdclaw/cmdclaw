// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const { mockStartGeneration, mockAbort, mockPosthogCapture, mockInvalidateQueries } = vi.hoisted(
  () => ({
    mockStartGeneration: vi.fn(),
    mockAbort: vi.fn(),
    mockPosthogCapture: vi.fn(),
    mockInvalidateQueries: vi.fn(),
  }),
);

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({
    capture: mockPosthogCapture,
  }),
}));

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: vi.fn(),
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
          <div {...props}>{children}</div>
        ),
    },
  ),
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

vi.mock("@/hooks/use-is-admin", () => ({
  useIsAdmin: () => ({ isAdmin: false, isLoading: false }),
}));

vi.mock("@/lib/chat-model-access", () => ({
  isModelAccessibleForNewChat: () => true,
}));

vi.mock("@/lib/generation-runtime", () => ({
  createGenerationRuntime: () => ({
    snapshot: {
      parts: [],
      segments: [],
      integrationsUsed: [],
      sandboxFiles: [],
      traceStatus: "complete",
    },
    handleText: vi.fn(),
    handleSystem: vi.fn(),
    handleThinking: vi.fn(),
    handleToolUse: vi.fn(),
    handleToolResult: vi.fn(),
    handlePendingApproval: vi.fn(),
    handleApprovalResult: vi.fn(),
    handleApproval: vi.fn(),
    handleAuthNeeded: vi.fn(),
    handleAuthProgress: vi.fn(),
    handleAuthResult: vi.fn(),
    handleSandboxFile: vi.fn(),
    handleDone: vi.fn(),
    handleError: vi.fn(),
    setStatus: vi.fn(),
    setApprovalStatus: vi.fn(),
    setAuthConnecting: vi.fn(),
    setAuthPending: vi.fn(),
    setAuthCancelled: vi.fn(),
    buildAssistantMessage: () => ({
      content: "",
      parts: [],
      integrationsUsed: [],
      sandboxFiles: [],
    }),
    getActivityStats: () => ({
      totalToolCalls: 0,
      completedToolCalls: 0,
      totalToolDurationMs: 0,
      maxToolDurationMs: 0,
      perToolUseIdMs: {},
    }),
  }),
}));

vi.mock("@/orpc/client", () => ({
  client: {
    conversation: {
      get: vi.fn(),
    },
  },
}));

vi.mock("@/orpc/hooks", () => ({
  useConversation: () => ({ data: null, isLoading: false }),
  useGeneration: () => ({
    startGeneration: mockStartGeneration,
    subscribeToGeneration: vi.fn(),
    abort: mockAbort,
  }),
  useSubmitApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitAuthResult: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useGetAuthUrl: () => ({ mutateAsync: vi.fn() }),
  useActiveGeneration: () => ({ data: null }),
  useCancelGeneration: () => ({ mutateAsync: vi.fn() }),
  useDetectUserMessageLanguage: () => ({ mutateAsync: vi.fn() }),
  useConversationQueuedMessages: () => ({ data: undefined }),
  useEnqueueConversationMessage: () => ({ mutateAsync: vi.fn() }),
  useRemoveConversationQueuedMessage: () => ({ mutateAsync: vi.fn() }),
  usePlatformSkillList: () => ({ data: [], isLoading: false }),
  useSkillList: () => ({ data: [], isLoading: false }),
  useUpdateAutoApprove: () => ({ mutateAsync: vi.fn() }),
  useProviderAuthStatus: () => ({ data: { connected: {}, shared: {} } }),
  useOpencodeFreeModels: () => ({ data: { models: [] } }),
  useTranscribe: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("./activity-feed", () => ({
  ActivityFeed: () => <div>Activity Feed</div>,
}));

vi.mock("./auth-request-card", () => ({
  AuthRequestCard: () => <div>Auth Request</div>,
}));

vi.mock("./bottom-action-bar", () => ({
  BottomActionBar: ({ onSubmit }: { onSubmit: (content: string) => void | Promise<unknown> }) => {
    const [status, setStatus] = React.useState("idle");
    const handleClick = React.useCallback(() => {
      setStatus("pending");
      void Promise.resolve(onSubmit("hello")).then(() => setStatus("resolved"));
    }, [onSubmit]);
    return (
      <div>
        <button type="button" onClick={handleClick}>
          Send
        </button>
        <div data-testid="submit-status">{status}</div>
      </div>
    );
  },
}));

vi.mock("./chat-message-sync", () => ({
  mergePersistedConversationMessages: ({
    currentMessages,
    persistedMessages,
  }: {
    currentMessages: unknown[];
    persistedMessages: unknown[];
  }) => (persistedMessages.length > 0 ? persistedMessages : currentMessages),
}));

vi.mock("./chat-model-store", () => ({
  useChatModelStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedModel: "anthropic/claude-sonnet-4-6",
      selectedAuthSource: null,
      setSelection: vi.fn(),
    }),
}));

vi.mock("./chat-skill-store", () => ({
  useChatSkillStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedSkillSlugsByScope: {},
      toggleSelectedSkillSlug: vi.fn(),
      clearSelectedSkillSlugs: vi.fn(),
    }),
}));

vi.mock("./message-list", () => ({
  MessageList: ({ messages }: { messages: Array<{ id: string; content: string }> }) => (
    <div>
      {messages.map((message) => (
        <div key={message.id}>{message.content}</div>
      ))}
    </div>
  ),
}));

vi.mock("./model-selector", () => ({
  ModelSelector: () => <div>Model Selector</div>,
}));

vi.mock("./question-approval-utils", () => ({
  collectQuestionApprovalToolUseIds: () => new Set<string>(),
  isQuestionApprovalRequest: () => false,
}));

vi.mock("./tool-approval-card", () => ({
  ToolApprovalCard: () => <div>Tool Approval</div>,
}));

vi.mock("./voice-indicator", () => ({
  VoiceIndicator: () => <div>Voice Indicator</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
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
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
  }) => <div onClick={onClick}>{children}</div>,
  DropdownMenuSeparator: () => <div />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onCheckedChange?.(event.target.checked);
      },
      [onCheckedChange],
    );
    return <input type="checkbox" checked={checked} onChange={handleChange} />;
  },
}));

import { ChatArea } from "./chat-area";

describe("ChatArea generation errors", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mockStartGeneration.mockReset();
    mockAbort.mockReset();
    mockInvalidateQueries.mockReset();
    mockPosthogCapture.mockReset();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("shows an inline error and exits Preparing agent when startGeneration fails before onStarted", async () => {
    mockStartGeneration.mockImplementationOnce(async (_input, callbacks) => {
      await Promise.resolve();
      callbacks.onError?.({
        code: "model_access_denied",
        message:
          "Selected ChatGPT model is not available for your current connection. Choose another model and retry.",
        phase: "start_rpc",
        transportCode: "BAD_REQUEST",
      });
      return null;
    });

    render(<ChatArea />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Selected ChatGPT model is not available for your current connection. Choose another model and retry.",
        ),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Preparing agent...")).not.toBeInTheDocument();
  });

  it("resolves submit immediately without waiting for the full stream to finish", async () => {
    mockStartGeneration.mockImplementation(() => new Promise(() => {}));

    render(<ChatArea conversationId="conv-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByTestId("submit-status")).toHaveTextContent("resolved");
    });
    expect(mockStartGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello", conversationId: "conv-1" }),
      expect.any(Object),
    );
  });
});
