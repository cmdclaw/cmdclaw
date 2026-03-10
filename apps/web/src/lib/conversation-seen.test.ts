import { describe, expect, it } from "vitest";
import {
  getConversationSeenTarget,
  getEffectiveSeenMessageCount,
  hasUnreadConversationResults,
} from "./conversation-seen";

describe("conversation seen helpers", () => {
  it("prefers the latest optimistic seen count", () => {
    expect(
      getEffectiveSeenMessageCount({
        serverSeenCount: 3,
        optimisticSeenCount: 5,
      }),
    ).toBe(5);
  });

  it("returns a new seen target only when messages exceed the current seen count", () => {
    expect(
      getConversationSeenTarget({
        messageCount: 6,
        serverSeenCount: 4,
        optimisticSeenCount: 5,
      }),
    ).toBe(6);

    expect(
      getConversationSeenTarget({
        messageCount: 5,
        serverSeenCount: 4,
        optimisticSeenCount: 5,
      }),
    ).toBeNull();
  });

  it("suppresses unread dots for active or already-seen conversations", () => {
    expect(
      hasUnreadConversationResults({
        isConversationActive: false,
        isConversationRunning: false,
        messageCount: 6,
        serverSeenCount: 4,
        optimisticSeenCount: 6,
      }),
    ).toBe(false);

    expect(
      hasUnreadConversationResults({
        isConversationActive: true,
        isConversationRunning: false,
        messageCount: 10,
        serverSeenCount: 0,
      }),
    ).toBe(false);

    expect(
      hasUnreadConversationResults({
        isConversationActive: false,
        isConversationRunning: false,
        messageCount: 2,
        serverSeenCount: 1,
      }),
    ).toBe(true);
  });
});
