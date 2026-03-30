import { describe, expect, it } from "vitest";
import { normalizeCmdclawArgv } from "./argv";

describe("normalizeCmdclawArgv", () => {
  it("defaults bare cmdclaw to chat", () => {
    expect(normalizeCmdclawArgv([])).toEqual(["chat"]);
  });

  it("routes bare chat flags through chat", () => {
    expect(normalizeCmdclawArgv(["--message", "hi"])).toEqual(["chat", "--message", "hi"]);
  });

  it("preserves explicit top-level commands", () => {
    expect(normalizeCmdclawArgv(["coworker", "list"])).toEqual(["coworker", "list"]);
  });
});
