// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InboxItem } from "./inbox-item";
import type { InboxItem as InboxItemType } from "./types";

const baseHandlers = {
  onToggle: vi.fn(),
  onToggleEditing: vi.fn(),
  onApprove: vi.fn(),
  onDeny: vi.fn(),
  onStop: vi.fn(),
  onContinue: vi.fn(),
  onAuthConnect: vi.fn(),
  onAuthCancel: vi.fn(),
  onSaveEdit: vi.fn(),
  onReply: vi.fn(),
  onOpenTarget: vi.fn(),
  onMarkAsRead: vi.fn(),
};

function buildPendingItem(): InboxItemType {
  return {
    kind: "coworker",
    id: "run-pending",
    runId: "run-pending",
    coworkerId: "cw-1",
    coworkerName: "Email Drafter",
    builderAvailable: true,
    title: "Email Drafter · May 26, 14:30",
    status: "needs_user_input",
    createdAt: new Date("2026-05-26T14:30:00.000Z"),
    updatedAt: new Date("2026-05-26T14:31:00.000Z"),
    generationId: null,
    conversationId: "conv-pending",
    errorMessage: null,
  };
}

describe("InboxItem", () => {
  it("labels pending starts as Needs your input and exposes Dismiss separately from Mark as read", () => {
    const handlers = {
      ...baseHandlers,
      onStop: vi.fn(),
      onMarkAsRead: vi.fn(),
    };

    render(
      <InboxItem
        item={buildPendingItem()}
        isExpanded
        isEditing={false}
        isBusy={false}
        {...handlers}
      />,
    );

    expect(screen.getByText("Needs your input")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Mark as read/i }));
    expect(handlers.onMarkAsRead).toHaveBeenCalledTimes(1);
    expect(handlers.onStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });
});
