type SeenCountInput = {
  serverSeenCount?: number | null;
  optimisticSeenCount?: number;
};

type UnreadConversationInput = SeenCountInput & {
  isConversationActive: boolean;
  isConversationRunning: boolean;
  messageCount: number;
};

type ConversationSeenTargetInput = SeenCountInput & {
  messageCount: number;
};

export function getEffectiveSeenMessageCount({
  serverSeenCount,
  optimisticSeenCount,
}: SeenCountInput): number {
  return Math.max(serverSeenCount ?? 0, optimisticSeenCount ?? 0);
}

export function getConversationSeenTarget({
  messageCount,
  serverSeenCount,
  optimisticSeenCount,
}: ConversationSeenTargetInput): number | null {
  const currentSeenCount = getEffectiveSeenMessageCount({
    serverSeenCount,
    optimisticSeenCount,
  });

  return messageCount > currentSeenCount ? messageCount : null;
}

export function hasUnreadConversationResults({
  isConversationActive,
  isConversationRunning,
  messageCount,
  serverSeenCount,
  optimisticSeenCount,
}: UnreadConversationInput): boolean {
  if (isConversationActive || isConversationRunning) {
    return false;
  }

  return (
    messageCount >
    getEffectiveSeenMessageCount({
      serverSeenCount,
      optimisticSeenCount,
    })
  );
}
