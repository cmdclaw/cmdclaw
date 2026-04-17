import { describe, expect, it } from "vitest";
import {
  buildCliLiveCleanupPlan,
  createCliLiveCleanupState,
  trackCliIdentifiersFromText,
} from "../e2e-cli/live-sandbox-cleanup";

describe("live-sandbox-cleanup", () => {
  it("tracks generation and conversation ids from CLI output", () => {
    const state = createCliLiveCleanupState();

    trackCliIdentifiersFromText(
      state,
      `
[generation] gen-123
[conversation] conv-456
[generation] gen-123
      `,
    );

    expect(Array.from(state.generationIds)).toEqual(["gen-123"]);
    expect(Array.from(state.conversationIds)).toEqual(["conv-456"]);
  });

  it("builds a deduplicated cleanup plan from runtime and generation rows", () => {
    const plan = buildCliLiveCleanupPlan({
      expectedProvider: "daytona",
      generationRows: [
        {
          id: "gen-1",
          conversationId: "conv-1",
          sandboxId: "sandbox-a",
          sandboxProvider: "daytona",
          runtimeId: "runtime-1",
        },
        {
          id: "gen-2",
          conversationId: "conv-1",
          sandboxId: "sandbox-a",
          sandboxProvider: "daytona",
          runtimeId: "runtime-1",
        },
      ],
      runtimeRows: [
        {
          id: "runtime-1",
          conversationId: "conv-1",
          sandboxId: "sandbox-a",
          sandboxProvider: "daytona",
          sessionId: "session-1",
          status: "active",
          activeGenerationId: "gen-2",
        },
      ],
    });

    expect(plan.sandboxIds).toEqual(["sandbox-a"]);
    expect(plan.runtimeIds).toEqual(["runtime-1"]);
    expect(plan.conversationIds).toEqual(["conv-1"]);
    expect(plan.providerMismatches).toEqual([]);
  });

  it("reports provider mismatches for bound sandboxes", () => {
    const plan = buildCliLiveCleanupPlan({
      expectedProvider: "daytona",
      generationRows: [],
      runtimeRows: [
        {
          id: "runtime-2",
          conversationId: "conv-2",
          sandboxId: "sandbox-b",
          sandboxProvider: "docker",
          sessionId: "session-2",
          status: "active",
          activeGenerationId: "gen-3",
        },
      ],
    });

    expect(plan.providerMismatches).toEqual([
      "runtime=runtime-2 conversation=conv-2 provider=docker sandboxId=sandbox-b",
    ]);
  });
});
