// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxCoworkerSelector, type InboxCoworkerSelectorItem } from "./inbox-coworker-selector";

const coworkers: InboxCoworkerSelectorItem[] = [
  {
    id: "cw-1",
    name: "Galien Pre-Visit Report",
    username: "galien-pre-visit-report",
    description: "Builds pre-visit reports.",
    status: "on",
    triggerType: "manual",
    recentRuns: [{ id: "run-1", status: "completed", startedAt: "2026-06-01T09:00:00.000Z" }],
  },
];

describe("InboxCoworkerSelector", () => {
  afterEach(() => {
    cleanup();
  });

  it("selects a coworker and omits the redundant coworker footer badge", () => {
    const handleSelect = vi.fn();

    render(
      <InboxCoworkerSelector
        coworkers={coworkers}
        onSelectCoworker={handleSelect}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /All coworkers/i }));

    expect(screen.queryByText("Coworker")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Galien Pre-Visit Report/i }));

    expect(handleSelect).toHaveBeenCalledWith("cw-1");
  });
});
