// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DualPanelWorkspace } from "./dual-panel-workspace";

void jestDomVitest;

afterEach(() => {
  cleanup();
});

describe("DualPanelWorkspace", () => {
  it("forces the right panel min-width to zero when collapsed", () => {
    const { container } = render(
      <DualPanelWorkspace
        left="Left panel"
        right="Right panel"
        collapsible
        rightPanelClassName="md:min-w-[34rem]"
        showTitles={false}
        hideMobileToggle
      />,
    );

    const rightSection = container.querySelectorAll("section")[1];

    fireEvent.click(screen.getByRole("button", { name: "Collapse right panel" }));

    expect(rightSection).toHaveStyle({ width: "0%", minWidth: "0px" });
  });

  it("renders the controlled collapsed state", () => {
    const { container } = render(
      <DualPanelWorkspace
        left="Left panel"
        right="Right panel"
        collapsible
        rightCollapsed
        rightPanelClassName="md:min-w-[34rem]"
        showTitles={false}
        hideMobileToggle
      />,
    );

    const rightSection = container.querySelectorAll("section")[1];

    expect(screen.getByRole("button", { name: "Expand right panel" })).toBeInTheDocument();
    expect(rightSection).toHaveStyle({ width: "0%", minWidth: "0px" });
  });

  it("calls the controlled collapse callback", () => {
    function ControlledHarness() {
      const [rightCollapsed, setRightCollapsed] = useState(false);

      return (
        <DualPanelWorkspace
          left="Left panel"
          right="Right panel"
          collapsible
          rightCollapsed={rightCollapsed}
          onRightCollapsedChange={setRightCollapsed}
          rightPanelClassName="md:min-w-[34rem]"
          showTitles={false}
          hideMobileToggle
        />
      );
    }

    render(<ControlledHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse right panel" }));
    expect(screen.getByRole("button", { name: "Expand right panel" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand right panel" }));
    expect(screen.getByRole("button", { name: "Collapse right panel" })).toBeInTheDocument();
  });
});
