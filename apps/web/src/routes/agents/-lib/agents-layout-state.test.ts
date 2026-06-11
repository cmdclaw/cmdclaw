import { describe, expect, it } from "vitest";
import { isPendingAgentsPathChange } from "./agents-layout-state";

describe("isPendingAgentsPathChange", () => {
  it("keeps the agents list visible while navigating from the list to a coworker info route", () => {
    expect(
      isPendingAgentsPathChange({
        pathname: "/agents/info/liam-linkedin-monitoring",
        resolvedPathname: "/agents",
        status: "pending",
      }),
    ).toBe(false);
  });

  it("keeps the agents list visible while navigating from the list to a coworker edit route", () => {
    expect(
      isPendingAgentsPathChange({
        pathname: "/agents/edit/liam-linkedin-monitoring",
        resolvedPathname: "/agents",
        status: "pending",
      }),
    ).toBe(false);
  });

  it("hides stale outlet while navigating away from a non-agent detail route", () => {
    expect(
      isPendingAgentsPathChange({
        pathname: "/agents/overview",
        resolvedPathname: "/agents",
        status: "pending",
      }),
    ).toBe(true);
  });

  it("keeps the active outlet when the target path is already resolved", () => {
    expect(
      isPendingAgentsPathChange({
        pathname: "/agents/edit/liam-linkedin-monitoring",
        resolvedPathname: "/agents/edit/liam-linkedin-monitoring",
        status: "idle",
      }),
    ).toBe(false);
  });
});
