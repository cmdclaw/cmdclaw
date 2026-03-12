import { describe, expect, it } from "vitest";
import type { Message } from "./message-list";
import { mergePersistedConversationMessages } from "./chat-message-sync";

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: "msg-1",
    role: "user",
    content: "",
    ...overrides,
  };
}

describe("mergePersistedConversationMessages", () => {
  it("preserves optimistic messages while the latest user message is not yet persisted", () => {
    const persistedMessages = [createMessage({ id: "msg-1", content: "first message" })];
    const currentMessages = [
      ...persistedMessages,
      createMessage({ id: "temp-2", content: "second message" }),
    ];

    expect(
      mergePersistedConversationMessages({
        currentMessages,
        persistedMessages,
        preserveOptimisticMessages: true,
      }),
    ).toEqual(currentMessages);
  });

  it("drops optimistic messages once the persisted snapshot catches up", () => {
    const currentMessages = [
      createMessage({ id: "msg-1", content: "first message" }),
      createMessage({ id: "temp-2", content: "second message" }),
    ];
    const persistedMessages = [
      createMessage({ id: "msg-1", content: "first message" }),
      createMessage({ id: "msg-2", content: "second message" }),
    ];

    expect(
      mergePersistedConversationMessages({
        currentMessages,
        persistedMessages,
        preserveOptimisticMessages: true,
      }),
    ).toEqual(persistedMessages);
  });

  it("replaces local messages when optimistic preservation is disabled", () => {
    const persistedMessages = [createMessage({ id: "msg-1", content: "persisted" })];
    const currentMessages = [createMessage({ id: "temp-1", content: "optimistic" })];

    expect(
      mergePersistedConversationMessages({
        currentMessages,
        persistedMessages,
        preserveOptimisticMessages: false,
      }),
    ).toEqual(persistedMessages);
  });
});
