// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "./page";

const {
  mockRouterPush,
  mockRouterReplace,
  mockUseInboxItems,
  mockCoworkerList,
  mockSubmitApprovalMutateAsync,
  mockSubmitAuthResultMutateAsync,
  mockCancelGenerationMutateAsync,
  mockEnqueueConversationMessageMutateAsync,
  mockTriggerCoworkerMutateAsync,
  mockGetAuthUrlMutateAsync,
  mockGetOrCreateBuilderConversationMutateAsync,
  mockEditApprovalAndResendMutateAsync,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => {
  return {
    mockRouterPush: vi.fn(),
    mockRouterReplace: vi.fn(),
    mockUseInboxItems: vi.fn(),
    mockCoworkerList: vi.fn(),
    mockSubmitApprovalMutateAsync: vi.fn(),
    mockSubmitAuthResultMutateAsync: vi.fn(),
    mockCancelGenerationMutateAsync: vi.fn(),
    mockEnqueueConversationMessageMutateAsync: vi.fn(),
    mockTriggerCoworkerMutateAsync: vi.fn(),
    mockGetAuthUrlMutateAsync: vi.fn(),
    mockGetOrCreateBuilderConversationMutateAsync: vi.fn(),
    mockEditApprovalAndResendMutateAsync: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? "")} />,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/orpc/hooks", () => ({
  useInboxItems: (input: unknown) => mockUseInboxItems(input),
  useCoworkerList: () => mockCoworkerList(),
  useSubmitApproval: () => ({ mutateAsync: mockSubmitApprovalMutateAsync }),
  useSubmitAuthResult: () => ({ mutateAsync: mockSubmitAuthResultMutateAsync }),
  useCancelGeneration: () => ({ mutateAsync: mockCancelGenerationMutateAsync }),
  useEnqueueConversationMessage: () => ({ mutateAsync: mockEnqueueConversationMessageMutateAsync }),
  useTriggerCoworker: () => ({ mutateAsync: mockTriggerCoworkerMutateAsync, isPending: false }),
  useGetAuthUrl: () => ({ mutateAsync: mockGetAuthUrlMutateAsync }),
  useGetOrCreateBuilderConversation: () => ({
    mutateAsync: mockGetOrCreateBuilderConversationMutateAsync,
  }),
  useInboxEditApprovalAndResend: () => ({ mutateAsync: mockEditApprovalAndResendMutateAsync }),
}));

describe("InboxPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInboxItems.mockReturnValue({
      data: {
        items: [
          {
            kind: "coworker",
            id: "run-1",
            runId: "run-1",
            coworkerId: "cw-1",
            coworkerName: "Inbox Triage",
            builderAvailable: true,
            title: "Inbox Triage · Mar 30, 14:32",
            status: "awaiting_approval",
            updatedAt: new Date("2026-03-30T14:40:00.000Z"),
            createdAt: new Date("2026-03-30T14:32:00.000Z"),
            generationId: "gen-1",
            conversationId: "conv-1",
            errorMessage: null,
            pendingApproval: {
              toolUseId: "tool-1",
              toolName: "Slack send",
              toolInput: { channel: "#sales", text: "hello" },
              integration: "slack",
              operation: "send",
              command: 'slack send --channel "#sales" --text "hello"',
            },
          },
          {
            kind: "chat",
            id: "conv-2",
            conversationId: "conv-2",
            conversationTitle: "Follow up with prospect",
            title: "Follow up with prospect",
            status: "error",
            updatedAt: new Date("2026-03-30T13:35:00.000Z"),
            createdAt: new Date("2026-03-30T13:00:00.000Z"),
            generationId: "gen-2",
            errorMessage: "Chat failed",
          },
        ],
        sourceOptions: [{ coworkerId: "cw-1", coworkerName: "Inbox Triage" }],
      },
      isLoading: false,
    });
    mockCoworkerList.mockReturnValue({
      data: [{ id: "cw-1", name: "Inbox Triage", status: "on" }],
    });
    mockSubmitApprovalMutateAsync.mockResolvedValue({ success: true });
    mockSubmitAuthResultMutateAsync.mockResolvedValue({ success: true });
    mockCancelGenerationMutateAsync.mockResolvedValue({ success: true });
    mockEnqueueConversationMessageMutateAsync.mockResolvedValue({ queuedMessageId: "qm-1" });
    mockTriggerCoworkerMutateAsync.mockResolvedValue({ runId: "run-1" });
    mockGetAuthUrlMutateAsync.mockResolvedValue({ authUrl: "https://example.com/auth" });
    mockGetOrCreateBuilderConversationMutateAsync.mockResolvedValue({
      conversationId: "builder-1",
    });
    mockEditApprovalAndResendMutateAsync.mockResolvedValue({ success: true });
  });

  it("renders real inbox rows and updates the inbox query when type filter changes", async () => {
    render(<InboxPage />);

    expect(screen.getByText("Inbox Triage · Mar 30, 14:32")).toBeTruthy();
    expect(screen.getByText("Follow up with prospect")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Chats" }));

    await waitFor(() => {
      expect(mockUseInboxItems).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: "chats",
        }),
      );
    });
  });

  it("wires approve and edit-before-approval actions to real mutations", async () => {
    render(<InboxPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /Inbox Triage · Mar 30, 14:32/i })[0]!);

    fireEvent.click(await screen.findByRole("button", { name: /Approve/i }));
    await waitFor(() => {
      expect(mockSubmitApprovalMutateAsync).toHaveBeenCalledWith({
        generationId: "gen-1",
        toolUseId: "tool-1",
        decision: "approve",
        questionAnswers: undefined,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /^Edit$/i }));
    fireEvent.change(screen.getByDisplayValue("#sales"), { target: { value: "#ops" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => {
      expect(mockEditApprovalAndResendMutateAsync).toHaveBeenCalledWith({
        kind: "coworker",
        generationId: "gen-1",
        toolUseId: "tool-1",
        updatedToolInput: {
          channel: "#ops",
          text: "hello",
        },
        conversationId: "conv-1",
        runId: "run-1",
      });
    });
  });
});
