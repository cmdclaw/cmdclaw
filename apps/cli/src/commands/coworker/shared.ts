import { createCoworkerRunner } from "@cmdclaw/client";
import { createAuthenticatedClient } from "../../lib/client";

export function getCoworkerRunner(params?: { server?: string; token?: string }) {
  const { client } = createAuthenticatedClient({
    serverUrl: params?.server,
    token: params?.token,
  });
  return {
    client,
    runner: createCoworkerRunner(client),
  };
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString();
}

export function statusBadge(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "success":
    case "completed":
      return "OK";
    case "failed":
    case "error":
      return "ERR";
    case "running":
      return "RUN";
    case "pending":
      return "PEND";
    default:
      return status ?? "-";
  }
}

export function formatConversationTranscript(
  messages: Array<{
    role: string;
    content: string;
    attachments: Array<{ filename: string; mimeType: string }>;
    sandboxFiles: Array<{ filename: string; path: string }>;
  }>,
): string {
  return messages
    .map((message) => {
      const parts = [`${message.role}: ${message.content}`];
      for (const attachment of message.attachments) {
        parts.push(`[attachment] ${attachment.filename} (${attachment.mimeType})`);
      }
      for (const file of message.sandboxFiles) {
        parts.push(`[sandbox-file] ${file.filename} (${file.path})`);
      }
      return parts.join("\n");
    })
    .join("\n\n")
    .trim();
}

export function parsePayload(input: string | undefined): unknown {
  if (!input?.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(input);
  } catch {
    throw new Error("Invalid JSON provided to --payload");
  }
}

export function splitCsv(input: string | undefined): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
