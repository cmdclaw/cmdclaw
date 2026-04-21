import { describe, expect, it } from "vitest";
import { dedupeApprovalSegments } from "./message-item-approval-dedupe";

describe("dedupeApprovalSegments", () => {
  it("collapses consecutive approval cards with the same display content", () => {
    const segments = dedupeApprovalSegments([
      {
        id: "seg-0",
        items: [
          {
            id: "activity-question-tool",
            timestamp: 1,
            type: "tool_call",
            content: "question",
            toolUseId: "question-tool-1",
            toolName: "question",
            operation: "question",
            status: "complete",
            input: {
              questions: [
                {
                  header: "Quick question",
                  question: "What would you like help with next?",
                  options: [{ label: "Email" }],
                },
              ],
            },
            result: '"answer"="Email"',
          },
        ],
        approval: {
          toolUseId: "question-tool-1",
          toolName: "question",
          toolInput: {
            questions: [
              {
                header: "Quick question",
                question: "What would you like help with next?",
                options: [{ label: "Email" }],
              },
            ],
          },
          integration: "cmdclaw",
          operation: "question",
          status: "approved",
          questionAnswers: [["Email"]],
        },
      },
      {
        id: "seg-1",
        items: [],
        approval: {
          toolUseId: "approval-tool-1",
          toolName: "question",
          toolInput: {
            questions: [
              {
                header: "Quick question",
                question: "What would you like help with next?",
                options: [{ label: "Email" }],
              },
            ],
          },
          integration: "cmdclaw",
          operation: "question",
          status: "approved",
          questionAnswers: [["Email"]],
        },
      },
      {
        id: "seg-2",
        items: [
          {
            id: "activity-text-1",
            timestamp: 2,
            type: "text",
            content: "What would you like me to do with email?",
          },
        ],
        approval: null,
      },
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.items).toHaveLength(1);
    expect(segments[0]?.approval).toMatchObject({
      status: "approved",
      questionAnswers: [["Email"]],
    });
    expect(segments[1]?.items).toHaveLength(1);
    expect(segments[1]?.approval).toBeNull();
  });
});
