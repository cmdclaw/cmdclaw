import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { createManagedGmailClient } from "../lib/gmail-auth";

export const schema = {
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
  name: "gmail.list",
  description: "List recent Gmail messages",
  annotations: {
    title: "List emails",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function gmailList(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const client = await createManagedGmailClient(extra);
  return client.listMessages(params);
}
