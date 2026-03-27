import { describe, expect, it } from "vitest";
import {
  getCoworkerCliSystemPrompt,
  parseCoworkerEditApplyEnvelope,
  parseCoworkerInvocationEnvelope,
} from "./coworker-runtime-cli";

describe("coworker-runtime-cli", () => {
  it("parses coworker invocation envelopes from bash stdout", () => {
    const envelope = parseCoworkerInvocationEnvelope({
      toolName: "Bash",
      toolInput: {
        command: 'coworker invoke --username linkedin-digest --message "Review this inbox" --json',
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

  it("parses coworker edit envelopes from bash stdout", () => {
    const envelope = parseCoworkerEditApplyEnvelope({
      toolName: "Bash",
      toolInput: {
        command:
          "coworker edit cw-1 --base-updated-at 2026-03-03T12:00:00.000Z --changes-file /tmp/cw-1-edit.json --json",
      },
      toolResult: {
        stdout: JSON.stringify({
          kind: "coworker_edit_apply",
          status: "applied",
          coworkerId: "cw-1",
          appliedChanges: ["prompt"],
          coworker: {
            coworkerId: "cw-1",
            updatedAt: "2026-03-03T12:01:00.000Z",
            prompt: "new",
            model: "openai/gpt-5.4",
            toolAccessMode: "selected",
            triggerType: "manual",
            schedule: null,
            allowedIntegrations: ["github"],
          },
          message: "Saved coworker edits: prompt.",
        }),
      },
    });

    expect(envelope).toEqual({
      kind: "coworker_edit_apply",
      status: "applied",
      coworkerId: "cw-1",
      appliedChanges: ["prompt"],
      coworker: {
        coworkerId: "cw-1",
        updatedAt: "2026-03-03T12:01:00.000Z",
        prompt: "new",
        model: "openai/gpt-5.4",
        toolAccessMode: "selected",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
      },
      message: "Saved coworker edits: prompt.",
      details: undefined,
    });
  });

  it("documents the list and invoke workflow", () => {
    expect(getCoworkerCliSystemPrompt()).toContain("coworker list --json");
    expect(getCoworkerCliSystemPrompt()).toContain("coworker invoke");
    expect(getCoworkerCliSystemPrompt()).toContain("coworker upload-document");
  });
});
