import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { createManagedGmailClient } from "../lib/gmail-auth";

export const schema = {
  query: z.string().optional().describe("Optional Gmail search query"),
  unread: z.boolean().optional().describe("Restrict to unread messages"),
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
  name: "gmail.latest",
  description: "Get the latest Gmail message matching an optional query",
  annotations: {
    title: "Latest email",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function gmailLatest(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const client = await createManagedGmailClient(extra);
  return client.latestMessage(params);
}
