// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityItem, type ActivityItemData } from "./activity-item";

void jestDomVitest;
afterEach(cleanup);

const toolCallFixture: ActivityItemData = {
  id: "tool-1",
  timestamp: 1,
  type: "tool_call",
  content: "Bash",
  toolName: "Bash",
  status: "complete",
  input: { command: "google-gmail list -l 1", description: "Get the latest email" },
  result: "done",
};

const textTableFixture: ActivityItemData = {
  id: "text-1",
  timestamp: 1,
  type: "text",
  content: `| City | Country |\n| --- | --- |\n| Dublin | Ireland |`,
};

const coworkerToolCallFixture: ActivityItemData = {
  id: "tool-2",
  timestamp: 2,
  type: "tool_call",
  content: "Bash",
  toolName: "Bash",
  status: "running",
  input: {
    command: 'coworker invoke --username linkedin-digest --message "Review this inbox" --json',
  },
};

describe("ActivityItem", () => {
  it("renders GFM table content for text activity items", () => {
    render(<ActivityItem item={textTableFixture} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "City" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Dublin" })).toBeInTheDocument();
  });

  it("uses tool input description as the visible label", () => {
    render(<ActivityItem item={toolCallFixture} />);

    expect(screen.getAllByText("Get the latest email").length).toBeGreaterThan(0);
    expect(screen.queryByText("Running command")).not.toBeInTheDocument();
  });

  it("hides tool input and result until details are expanded", () => {
    render(<ActivityItem item={toolCallFixture} />);

    expect(screen.getAllByText("Get the latest email").length).toBeGreaterThan(0);
    expect(screen.queryByText("google-gmail list -l 1")).not.toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show tool details" }));

    expect(screen.getByText("Request (Bash)")).toBeInTheDocument();
    expect(screen.getByText("google-gmail list -l 1")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("uses coworker command metadata for bash activity labels", () => {
    const { container } = render(<ActivityItem item={coworkerToolCallFixture} />);

    expect(screen.getByText("Invoking coworker")).toBeInTheDocument();
    expect(screen.queryByText("Running command")).not.toBeInTheDocument();
    expect(container.querySelector(".lucide-bot")).not.toBeNull();
  });
});
