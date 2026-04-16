import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { createManagedGmailClient } from "../lib/gmail-auth";

export const schema = {
  query: z.string().min(1).describe("Gmail search query"),
  limit: z.number().int().positive().max(50).optional().describe("Maximum number of emails"),
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
  name: "gmail.search",
  description: "Search Gmail messages",
  annotations: {
    title: "Search emails",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function gmailSearch(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const client = await createManagedGmailClient(extra);
  const result = await client.searchMessages(params);
  return toMcpToolResult(result);
}
