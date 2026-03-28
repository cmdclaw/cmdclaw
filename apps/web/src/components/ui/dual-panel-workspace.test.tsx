// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DualPanelWorkspace } from "./dual-panel-workspace";

void jestDomVitest;

describe("DualPanelWorkspace", () => {
  it("forces the right panel min-width to zero when collapsed", () => {
    render(
      <DualPanelWorkspace
        left="Left panel"
        right="Right panel"
        collapsible
        rightPanelClassName="md:min-w-[34rem]"
        showTitles={false}
        hideMobileToggle
      />,
    );

    const rightSection = screen.getByText("Right panel").closest("section");

    fireEvent.click(screen.getByRole("button", { name: "Collapse right panel" }));

    expect(rightSection).toHaveStyle({ width: "0%", minWidth: "0px" });
  });
});
