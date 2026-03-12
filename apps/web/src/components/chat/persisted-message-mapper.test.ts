import { describe, expect, it } from "vitest";
import { mapPersistedMessagesToChatMessages } from "./persisted-message-mapper";

describe("mapPersistedMessagesToChatMessages", () => {
  it("maps coworker invocation parts into chat message parts", () => {
    const messages = mapPersistedMessagesToChatMessages([
      {
        id: "msg-1",
        role: "assistant",
        content: "",
        contentParts: [
          {
            type: "coworker_invocation",
            coworker_id: "cw-1",
            username: "linkedin-digest",
            name: "LinkedIn Digest",
            run_id: "run-1",
            conversation_id: "conv-1",
            generation_id: "gen-1",
            status: "running",
            attachment_names: ["voice-note.m4a"],
            message: "Review these LinkedIn messages",
          },
        ],
      },
    ]);

    expect(messages[0]?.parts).toEqual([
      {
        type: "coworker_invocation",
        coworkerId: "cw-1",
        username: "linkedin-digest",
        name: "LinkedIn Digest",
        runId: "run-1",
        conversationId: "conv-1",
        generationId: "gen-1",
        status: "running",
        attachmentNames: ["voice-note.m4a"],
        message: "Review these LinkedIn messages",
      },
    ]);
  });
});
