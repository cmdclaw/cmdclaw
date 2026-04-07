// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const { useAdminUsageDashboardMock, useAdminWorkspacesMock } = vi.hoisted(() => ({
  useAdminUsageDashboardMock: vi.fn(),
  useAdminWorkspacesMock: vi.fn(),
}));

type SelectItemProps = {
  value: string;
  children: React.ReactNode;
};

function MockSelectItem(_props: SelectItemProps) {
  return null;
}

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

vi.mock("@/components/ui/select", async () => {
  const ReactModule = await import("react");

  function extractItems(children: React.ReactNode, items: SelectItemProps[]) {
    ReactModule.Children.forEach(children, (child) => {
      if (!ReactModule.isValidElement(child)) {
        return;
      }

      const element = child as React.ReactElement<{
        value?: string;
        children?: React.ReactNode;
      }>;

      if (element.type === MockSelectItem) {
        items.push({
          value: element.props.value as string,
          children: element.props.children,
        });
        return;
      }

      if (element.props.children !== undefined) {
        extractItems(element.props.children, items);
      }
    });
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      children: React.ReactNode;
    }) => {
      const items: SelectItemProps[] = [];
      extractItems(children, items);
      const handleChange = ReactModule.useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(event.target.value),
        [onValueChange],
      );

      return (
        <select value={value ?? ""} onChange={handleChange}>
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.children}
            </option>
          ))}
        </select>
      );
    },
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: MockSelectItem,
  };
});

vi.mock("@/orpc/hooks", () => ({
  useAdminUsageDashboard: useAdminUsageDashboardMock,
  useAdminWorkspaces: useAdminWorkspacesMock,
}));

import AdminUsagePage from "./page";

describe("AdminUsagePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAdminWorkspacesMock.mockReturnValue({
      data: [
        { id: "ws-1", name: "Acme Corp" },
        { id: "ws-2", name: "Startup Labs" },
      ],
      isLoading: false,
      error: null,
    });
    useAdminUsageDashboardMock.mockImplementation((workspaceId: string | null) => {
      if (workspaceId === "ws-1") {
        return {
          data: {
            summary: {
              inputTokens: 110,
              outputTokens: 70,
              totalTokens: 180,
            },
            dailyByModel: [
              { date: "2026-04-01", model: "claude-sonnet-4-6", totalTokens: 120 },
              { date: "2026-04-02", model: "gpt-4o", totalTokens: 60 },
            ],
            dailyByType: [
              { date: "2026-04-01", type: "coworker_runner", totalTokens: 120 },
              { date: "2026-04-02", type: "chat", totalTokens: 60 },
            ],
            coworkerBreakdown: [
              {
                name: "@reviewer",
                type: "coworker_runner",
                inputTokens: 80,
                outputTokens: 40,
                totalTokens: 120,
              },
              {
                name: "Chat (direct)",
                type: "chat",
                inputTokens: 30,
                outputTokens: 30,
                totalTokens: 60,
              },
            ],
          },
          isLoading: false,
          error: null,
        };
      }

      if (workspaceId === "ws-2") {
        return {
          data: {
            summary: {
              inputTokens: 9,
              outputTokens: 6,
              totalTokens: 15,
            },
            dailyByModel: [{ date: "2026-04-03", model: "claude-haiku-4-5", totalTokens: 15 }],
            dailyByType: [{ date: "2026-04-03", type: "coworker_builder", totalTokens: 15 }],
            coworkerBreakdown: [
              {
                name: "Coworker Builder",
                type: "coworker_builder",
                inputTokens: 9,
                outputTokens: 6,
                totalTokens: 15,
              },
            ],
          },
          isLoading: false,
          error: null,
        };
      }

      return {
        data: undefined,
        isLoading: false,
        error: null,
      };
    });
  });

  it("loads the default workspace and refreshes usage when the workspace changes", async () => {
    render(<AdminUsagePage />);

    await waitFor(() => {
      expect(useAdminUsageDashboardMock).toHaveBeenCalledWith("ws-1");
    });

    expect(screen.getByText("180")).toBeInTheDocument();
    expect(screen.getByText("@reviewer")).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "ws-2" },
    });

    await waitFor(() => {
      expect(useAdminUsageDashboardMock).toHaveBeenLastCalledWith("ws-2");
    });

    expect(screen.getAllByText("15").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Coworker Builder").length).toBeGreaterThan(0);
  });

  it("shows a loading state while workspaces are loading", () => {
    useAdminWorkspacesMock.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    });
    useAdminUsageDashboardMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    render(<AdminUsagePage />);

    expect(screen.getByText("Loading usage dashboard")).toBeInTheDocument();
  });

  it("shows empty states when the selected workspace has no usage", async () => {
    useAdminWorkspacesMock.mockReturnValueOnce({
      data: [{ id: "ws-empty", name: "Empty Workspace" }],
      isLoading: false,
      error: null,
    });
    useAdminUsageDashboardMock.mockImplementation((workspaceId: string | null) => {
      if (workspaceId === "ws-empty") {
        return {
          data: {
            summary: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            dailyByModel: [],
            dailyByType: [],
            coworkerBreakdown: [],
          },
          isLoading: false,
          error: null,
        };
      }

      return {
        data: undefined,
        isLoading: false,
        error: null,
      };
    });

    render(<AdminUsagePage />);

    await waitFor(() => {
      expect(useAdminUsageDashboardMock).toHaveBeenCalledWith("ws-empty");
    });

    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("No usage data for this workspace in the last 30 days.").length,
    ).toBe(2);
  });
});
