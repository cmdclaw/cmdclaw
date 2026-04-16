import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { createManagedGmailClient } from "../lib/gmail-auth";

export const schema = {
  query: z.string().optional().describe("Optional Gmail search query"),
  scope: z
    .enum(["inbox", "all", "strict-all"])
    .optional()
    .describe("Mailbox scope to search"),
  includeSpamTrash: z
    .boolean()
    .optional()
    .describe("Whether to include spam and trash results"),
};

export const metadata: ToolMetadata = {
  name: "gmail.unread",
  description: "Count unread Gmail messages",
  annotations: {
    title: "Unread count",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function gmailUnread(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const client = await createManagedGmailClient(extra);
  const result = await client.countUnread(params);
  return toMcpToolResult(result);
}
