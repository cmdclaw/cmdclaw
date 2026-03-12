import { describe, expect, it } from "vitest";
import {
  getCoworkerCliSystemPrompt,
  parseCoworkerInvocationEnvelope,
} from "./coworker-runtime-cli";

describe("coworker-runtime-cli", () => {
  it("parses coworker invocation envelopes from bash stdout", () => {
    const envelope = parseCoworkerInvocationEnvelope({
      toolName: "Bash",
      toolInput: {
        command:
          'coworker invoke --username linkedin-digest --message "Review this inbox" --json',
      },
      toolResult: {
        stdout: JSON.stringify({
          kind: "coworker_invocation",
          coworkerId: "cw-1",
          username: "linkedin-digest",
          name: "LinkedIn Digest",
          runId: "run-1",
          conversationId: "conv-1",
          generationId: "gen-1",
          status: "running",
          attachmentNames: ["voice-note.m4a"],
          message: "Review this inbox",
        }),
      },
    });

    expect(envelope).toEqual({
      kind: "coworker_invocation",
      coworkerId: "cw-1",
      username: "linkedin-digest",
      name: "LinkedIn Digest",
      runId: "run-1",
      conversationId: "conv-1",
      generationId: "gen-1",
      status: "running",
      attachmentNames: ["voice-note.m4a"],
      message: "Review this inbox",
    });
  });

  it("ignores non-json coworker commands", () => {
    const envelope = parseCoworkerInvocationEnvelope({
      toolName: "Bash",
      toolInput: {
        command: 'coworker invoke --username linkedin-digest --message "Review this inbox"',
      },
      toolResult: "Started coworker",
    });

    expect(envelope).toBeNull();
  });

  it("documents the list and invoke workflow", () => {
    expect(getCoworkerCliSystemPrompt()).toContain("coworker list --json");
    expect(getCoworkerCliSystemPrompt()).toContain("coworker invoke");
  });
});
