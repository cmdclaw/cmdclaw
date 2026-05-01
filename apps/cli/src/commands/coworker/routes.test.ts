import { describe, expect, it } from "vitest";
import { coworkerBuildCommand } from "./routes";

describe("coworker command routes", () => {
  it("exposes builder flags for starting a coworker discussion", () => {
    const flags = (coworkerBuildCommand as { parameters?: { flags?: Record<string, unknown> } })
      .parameters?.flags;

    expect(flags?.message).toBeDefined();
    expect(flags?.attach).toBeDefined();
    expect(flags?.model).toBeDefined();
    expect(flags?.authSource).toBeDefined();
    expect(flags?.integrations).toBeDefined();
    expect(flags?.file).toBeDefined();
    expect(flags?.autoApprove).toBeDefined();
    expect(flags?.chaosRunDeadline).toBeDefined();
    expect(flags?.chaosApproval).toBeDefined();
    expect(flags?.chaosApprovalParkAfter).toBeDefined();
  });
});
