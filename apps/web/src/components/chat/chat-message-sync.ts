import type { AttachmentData, Message } from "./message-list";

function isOptimisticMessage(message: Message): boolean {
  return message.id.startsWith("temp-");
}

function getAttachmentSignature(attachments: AttachmentData[] | undefined): string {
  if (!attachments || attachments.length === 0) {
    return "";
  }
  return attachments.map((attachment) => `${attachment.name}:${attachment.mimeType}`).join("|");
}

function hasPersistedEquivalentMessage(message: Message, persistedMessages: Message[]): boolean {
  const attachmentSignature = getAttachmentSignature(message.attachments);
  return persistedMessages.some(
    (persisted) =>
      persisted.role === message.role &&
      persisted.content === message.content &&
      getAttachmentSignature(persisted.attachments) === attachmentSignature,
  );
}

export function mergePersistedConversationMessages(params: {
  currentMessages: Message[];
  persistedMessages: Message[];
  preserveOptimisticMessages: boolean;
}): Message[] {
  if (!params.preserveOptimisticMessages) {
    return params.persistedMessages;
  }

  const unsyncedOptimisticMessages = params.currentMessages.filter(
    (message) =>
      isOptimisticMessage(message) &&
      !hasPersistedEquivalentMessage(message, params.persistedMessages),
  );

  if (unsyncedOptimisticMessages.length === 0) {
    return params.persistedMessages;
  }

  return [...params.persistedMessages, ...unsyncedOptimisticMessages];
}
