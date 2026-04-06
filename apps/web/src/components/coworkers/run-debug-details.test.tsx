// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunDebugDetails } from "./run-debug-details";

void jestDomVitest;

const DEBUG_INFO_WITH_TIMESTAMP = {
  originalErrorAt: "2026-04-06T04:49:43.000Z",
  originalErrorMessage: "Error: Agent preparation timed out after 45 seconds.",
  originalErrorPhase: "agent_init_failed",
};

const DEBUG_INFO_WITHOUT_TIMESTAMP = {
  originalErrorMessage: "Error: Agent preparation timed out after 45 seconds.",
  originalErrorPhase: "agent_init_failed",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RunDebugDetails", () => {
  it("shows the captured error time when present in debug info", () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("Apr 6, 2026, 5:49:43 AM");

    render(<RunDebugDetails debugInfo={DEBUG_INFO_WITH_TIMESTAMP} />);

    expect(screen.getByText("Technical details")).toBeInTheDocument();
    expect(screen.getByText(/Occurred at:/)).toBeInTheDocument();
    expect(screen.getByText("Apr 6, 2026, 5:49:43 AM")).toBeInTheDocument();
  });

  it("falls back to the run timestamp when the captured error time is unavailable", () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("Apr 6, 2026, 5:50:00 AM");

    render(
      <RunDebugDetails
        debugInfo={DEBUG_INFO_WITHOUT_TIMESTAMP}
        fallbackTimestamp="2026-04-06T04:50:00.000Z"
      />,
    );

    expect(screen.getByText(/Recorded at:/)).toBeInTheDocument();
    expect(screen.getByText("Apr 6, 2026, 5:50:00 AM")).toBeInTheDocument();
  });
});
