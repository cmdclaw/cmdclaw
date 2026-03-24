// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const {
  mockUpdateCoworkerMutateAsync,
  mockGetOrCreateBuilderConversationMutate,
  mockSetSelectedSkillSlugs,
  mockTriggerCoworkerMutateAsync,
  mockRouterPush,
} = vi.hoisted(() => ({
  mockUpdateCoworkerMutateAsync: vi.fn(),
  mockGetOrCreateBuilderConversationMutate: vi.fn(),
  mockSetSelectedSkillSlugs: vi.fn(),
  mockTriggerCoworkerMutateAsync: vi.fn(),
  mockRouterPush: vi.fn(),
}));

function MockContainer({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function MockImage() {
  return <div data-testid="mock-image" />;
}

function MockSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange(event.target.checked);
    },
    [onCheckedChange],
  );

  return <input type="checkbox" checked={checked} onChange={handleChange} />;
}

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "cw-1" }),
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("next/image", () => ({
  default: MockImage,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/chat/chat-area", () => ({
  ChatArea: () => <div>Chat</div>,
}));

vi.mock("@/components/chat/model-selector", () => ({
  ModelSelector: ({
    selectedModel,
    onSelectionChange,
  }: {
    selectedModel: string;
    onSelectionChange: (input: { model: string; authSource?: "user" | "shared" | null }) => void;
  }) => {
    const handleClick = React.useCallback(() => {
      onSelectionChange({ model: "openai/gpt-5.4", authSource: "shared" });
    }, [onSelectionChange]);

    return (
      <button type="button" onClick={handleClick}>
        Model selector: {selectedModel}
      </button>
    );
  },
}));

vi.mock("@/components/chat/chat-skill-store", () => ({
  useChatSkillStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectedSkillSlugsByScope: {},
      setSelectedSkillSlugs: mockSetSelectedSkillSlugs,
    }),
}));

vi.mock("@/components/ui/alert-dialog", () => {
  return {
    AlertDialog: MockContainer,
    AlertDialogAction: MockContainer,
    AlertDialogCancel: MockContainer,
    AlertDialogContent: MockContainer,
    AlertDialogDescription: MockContainer,
    AlertDialogFooter: MockContainer,
    AlertDialogHeader: MockContainer,
    AlertDialogTitle: MockContainer,
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = "button",
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dialog", () => {
  return {
    Dialog: MockContainer,
    DialogContent: MockContainer,
    DialogHeader: MockContainer,
    DialogTitle: MockContainer,
  };
});

vi.mock("@/components/ui/dual-panel-workspace", () => ({
  DualPanelWorkspace: ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
    <div>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => <input ref={ref} {...props} />,
  ),
}));

vi.mock("@/components/ui/select", () => {
  return {
    Select: MockContainer,
    SelectContent: MockContainer,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <div data-value={value}>{children}</div>
    ),
    SelectTrigger: MockContainer,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

vi.mock("@/components/ui/switch", () => ({
  Switch: MockSwitch,
}));

vi.mock("@/components/ui/tabs", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const TabsContext = ReactModule.createContext<(key: string) => void>(() => undefined);
  return {
    AnimatedTabs: ({
      children,
      onTabChange,
    }: {
      children: React.ReactNode;
      onTabChange: (key: string) => void;
    }) => <TabsContext.Provider value={onTabChange}>{children}</TabsContext.Provider>,
    AnimatedTab: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const onTabChange = ReactModule.useContext(TabsContext);
      const handleClick = ReactModule.useCallback(() => {
        onTabChange(value);
      }, [onTabChange, value]);
      return <button onClick={handleClick}>{children}</button>;
    },
  };
});

vi.mock("@/hooks/use-is-admin", () => ({
  useIsAdmin: () => ({ isAdmin: false }),
}));

vi.mock("@/orpc/hooks", () => ({
  useCreateCoworkerForwardingAlias: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDisableCoworkerForwardingAlias: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRotateCoworkerForwardingAlias: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCoworker: () => ({
    data: {
      id: "cw-1",
      name: "Existing Coworker",
      description: "Existing description",
      username: "existing-user",
      status: "on",
      autoApprove: true,
      triggerType: "manual",
      prompt: "Existing prompt",
      model: "anthropic/claude-sonnet-4-6",
      promptDo: null,
      promptDont: null,
      allowedIntegrations: ["slack"],
      allowedCustomIntegrations: [],
      schedule: null,
      createdAt: new Date("2026-03-12T10:00:00.000Z"),
      updatedAt: new Date("2026-03-12T10:00:00.000Z"),
      runs: [],
    },
    isLoading: false,
  }),
  useCoworkerForwardingAlias: () => ({ data: null }),
  useUpdateCoworker: () => ({ mutateAsync: mockUpdateCoworkerMutateAsync }),
  useDeleteCoworker: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCoworkerRuns: () => ({ data: [], refetch: vi.fn() }),
  useTriggerCoworker: () => ({ mutateAsync: mockTriggerCoworkerMutateAsync, isPending: false }),
  useGetOrCreateBuilderConversation: () => ({
    mutate: mockGetOrCreateBuilderConversationMutate,
  }),
  usePlatformSkillList: () => ({ data: [], isLoading: false }),
  useProviderAuthStatus: () => ({
    data: {
      connected: {},
      shared: { openai: { connectedAt: new Date("2026-03-12T10:00:00.000Z") } },
    },
  }),
  useSkillList: () => ({ data: [], isLoading: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import CoworkerEditorPage from "./page";

describe("CoworkerEditorPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateCoworkerMutateAsync.mockReset();
    mockGetOrCreateBuilderConversationMutate.mockReset();
    mockSetSelectedSkillSlugs.mockReset();
    mockTriggerCoworkerMutateAsync.mockReset();
    mockRouterPush.mockReset();
    mockUpdateCoworkerMutateAsync.mockResolvedValue({ success: true });
    mockTriggerCoworkerMutateAsync.mockResolvedValue({ runId: "run-1" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });

  it("hydrates description and username and includes them in autosave updates", async () => {
    render(<CoworkerEditorPage />);

    expect(screen.getByDisplayValue("Existing description")).toBeInTheDocument();
    expect(screen.getByDisplayValue("existing-user")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("Existing description"), {
      target: { value: "Updated description" },
    });
    fireEvent.change(screen.getByDisplayValue("existing-user"), {
      target: { value: "updated-user" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockUpdateCoworkerMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cw-1",
        description: "Updated description",
        username: "updated-user",
      }),
    );
  });

  it("hydrates model and includes model changes in autosave updates", async () => {
    render(<CoworkerEditorPage />);

    expect(
      screen.getAllByRole("button", {
        name: /Model selector: anthropic\/claude-sonnet-4-6/i,
      })[0],
    ).toBeInTheDocument();

    for (const button of screen.getAllByRole("button", {
      name: /Model selector: anthropic\/claude-sonnet-4-6/i,
    })) {
      fireEvent.click(button);
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockUpdateCoworkerMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cw-1",
        model: "openai/gpt-5.4",
      }),
    );
  });

  it("navigates to the created run when starting a run", async () => {
    render(<CoworkerEditorPage />);

    fireEvent.click(screen.getAllByText("Run now")[0]!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouterPush).toHaveBeenCalledWith("/coworkers/runs/run-1");
  });

  it("saves model changes before starting a run", async () => {
    render(<CoworkerEditorPage />);
    for (const button of screen.getAllByRole("button", {
      name: /Model selector: anthropic\/claude-sonnet-4-6/i,
    })) {
      fireEvent.click(button);
    }

    fireEvent.click(screen.getAllByText("Run now")[0]!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockUpdateCoworkerMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5.4",
      }),
    );
    expect(mockTriggerCoworkerMutateAsync).toHaveBeenCalledWith({ id: "cw-1", payload: {} });
    expect(mockUpdateCoworkerMutateAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockTriggerCoworkerMutateAsync.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
