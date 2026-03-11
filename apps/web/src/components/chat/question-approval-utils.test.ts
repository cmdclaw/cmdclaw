import { describe, expect, it } from "vitest";
import {
  collectQuestionApprovalToolUseIds,
  parseQuestionRequestPayload,
} from "./question-approval-utils";

describe("question approval utils", () => {
  it("parses question payloads from cmdclaw question approvals", () => {
    expect(
      parseQuestionRequestPayload({
        questions: [
          {
            header: "Topic",
            question: "Choose one",
            options: [{ label: "Alpha", description: "First" }, { label: "Beta" }],
          },
        ],
      }),
    ).toEqual({
      questions: [
        {
          header: "Topic",
          question: "Choose one",
          options: [{ label: "Alpha", description: "First" }, { label: "Beta" }],
          multiple: undefined,
          custom: undefined,
        },
      ],
    });
  });

  it("collects both synthetic and linked tool ids for question approvals only", () => {
    const toolUseIds = collectQuestionApprovalToolUseIds([
      {
        toolUseId: "opencode-question-1",
        toolInput: { tool: { callID: "call-question-1" } },
        toolName: "Question",
        integration: "cmdclaw",
        operation: "question",
      },
      {
        toolUseId: "slack-1",
        toolInput: { channel: "general" },
        toolName: "slack",
        integration: "slack",
        operation: "send_message",
      },
    ]);

    expect(Array.from(toolUseIds).toSorted()).toEqual(["call-question-1", "opencode-question-1"]);
  });
});
