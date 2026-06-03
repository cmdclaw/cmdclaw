// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type VitestProcedure = Extract<
  NonNullable<Parameters<typeof vi.fn>[0]>,
  (...args: never[]) => unknown
>;
import { InboxItem } from "./inbox-item";
import type { InboxCoworkerItem } from "./types";

const baseHandlers = {
  onToggle: vi.fn<VitestProcedure>(),
  onToggleEditing: vi.fn<VitestProcedure>(),
  onApprove: vi.fn<VitestProcedure>(),
  onDeny: vi.fn<VitestProcedure>(),
  onStop: vi.fn<VitestProcedure>(),
  onContinue: vi.fn<VitestProcedure>(),
  onAuthConnect: vi.fn<VitestProcedure>(),
  onAuthCancel: vi.fn<VitestProcedure>(),
  onSaveEdit: vi.fn<VitestProcedure>(),
  onReply: vi.fn<VitestProcedure>(),
  onOpenTarget: vi.fn<VitestProcedure>(),
  onMarkAsRead: vi.fn<VitestProcedure>(),
};

function buildPendingItem(): InboxCoworkerItem {
  return {
    kind: "coworker",
    id: "run-pending",
    runId: "run-pending",
    coworkerId: "cw-1",
    coworkerName: "Email Drafter",
    builderAvailable: true,
    title: "Email Drafter",
    status: "needs_user_input",
    createdAt: new Date("2026-05-26T14:30:00.000Z"),
    updatedAt: new Date("2026-05-26T14:31:00.000Z"),
    generationId: null,
    conversationId: "conv-pending",
    lastAgentMessage: null,
    errorMessage: null,
  };
}

function buildCompletedItem(): InboxCoworkerItem {
  return {
    ...buildPendingItem(),
    id: "run-completed",
    runId: "run-completed",
    title: "Email Drafter",
    status: "completed",
    generationId: "gen-completed",
  };
}

function buildCompletedMarkdownItem(): InboxCoworkerItem {
  return {
    ...buildCompletedItem(),
    lastAgentMessage: [
      "## Summary",
      "Triggered by the verification run.",
      "PDF generated and shared in chat.",
      "",
      "- **Done**: reviewed the pharmacy record.",
      "- Next visit: `2026-06-19`.",
      "",
      "Full details ".repeat(80),
    ].join("\n"),
  };
}

describe("InboxItem", () => {
  afterEach(() => {
    cleanup();
  });

  it("labels pending starts as Needs your input and exposes Dismiss separately from Mark as read", () => {
    const handlers = {
      ...baseHandlers,
      onStop: vi.fn<VitestProcedure>(),
      onMarkAsRead: vi.fn<VitestProcedure>(),
    };

    render(<InboxItem item={buildPendingItem()} isEditing={false} isBusy={false} {...handlers} />);

    expect(screen.getByText("Needs your input")).toBeTruthy();
    expect(screen.queryByText("coworker")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Mark read/i }));
    expect(handlers.onMarkAsRead).toHaveBeenCalledTimes(1);
    expect(handlers.onStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });

  it("renders completed runs as history without stop controls", () => {
    render(
      <InboxItem item={buildCompletedItem()} isEditing={false} isBusy={false} {...baseHandlers} />,
    );

    expect(screen.getByText("completed")).toBeTruthy();
    expect(screen.queryByText(/Updated/)).toBeNull();
    expect(screen.getByText(/\d+[mhd]/)).toBeTruthy();
    expect(screen.queryByText(/Started/)).toBeNull();
    expect(screen.getByRole("button", { name: "Chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark read" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open run/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Stop/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Dismiss/i })).toBeNull();
    expect(screen.queryByPlaceholderText("Reply and open thread...")).toBeNull();
  });

  it("renders agent messages as expandable markdown previews", () => {
    const { container } = render(
      <InboxItem
        item={buildCompletedMarkdownItem()}
        isEditing={false}
        isBusy={false}
        {...baseHandlers}
      />,
    );

    expect(screen.getByRole("heading", { name: "Summary" })).toBeTruthy();
    expect(container.querySelector("br")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText(/\*\*Done\*\*/)).toBeNull();

    const expandButton = screen.getByRole("button", { name: /Show full message/i });
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandButton);

    expect(screen.getByRole("button", { name: /Show less/i }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});
