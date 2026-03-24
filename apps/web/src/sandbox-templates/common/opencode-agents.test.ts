import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readAgent(agentFileName: string): string {
  return readFileSync(path.join(__dirname, "agents", agentFileName), "utf8");
}

describe("OpenCode agent definitions", () => {
  it("allows the question tool for chat and coworker builder agents", () => {
    expect(readAgent("cmdclaw-chat.md")).toContain("permission:\n  question: allow");
    expect(readAgent("cmdclaw-coworker-builder.md")).toContain("permission:\n  question: allow");
  });
});
