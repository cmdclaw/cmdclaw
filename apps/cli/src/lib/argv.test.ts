import { describe, expect, it } from "vitest";
import { normalizeBapArgv } from "./argv";

describe("normalizeBapArgv", () => {
  it("defaults bare bap to chat", () => {
    expect(normalizeBapArgv([])).toEqual(["chat"]);
  });

  it("routes bare chat flags through chat", () => {
    expect(normalizeBapArgv(["--message", "hi"])).toEqual(["chat", "--message", "hi"]);
  });

  it("normalizes documented kebab-case chat flags", () => {
    expect(
      normalizeBapArgv([
        "chat",
        "--auto-approve",
        "--no-validate",
        "--chaos-run-deadline",
        "60s",
        "--chaos-approval",
        "defer",
        "--chaos-approval-park-after",
        "5s",
        "--chaos-runtime-no-progress",
        "2s",
        "--chaos-force-runtime-no-progress",
        "--attach-generation",
        "gen-1",
      ]),
    ).toEqual([
      "chat",
      "--autoApprove",
      "--noValidate",
      "--chaosRunDeadline",
      "60s",
      "--chaosApproval",
      "defer",
      "--chaosApprovalParkAfter",
      "5s",
      "--chaosRuntimeNoProgress",
      "2s",
      "--chaosForceRuntimeNoProgress",
      "--attachGeneration",
      "gen-1",
    ]);
  });

  it("preserves explicit top-level commands", () => {
    expect(normalizeBapArgv(["coworker", "list"])).toEqual(["coworker", "list"]);
  });
});
