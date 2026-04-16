import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { createManagedGmailClient } from "../lib/gmail-auth";

export const schema = {
  messageId: z.string().min(1).describe("Gmail message ID"),
};

export const metadata: ToolMetadata = {
  name: "gmail.get",
  description: "Get full Gmail message content",
  annotations: {
    title: "Get email",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function gmailGet(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const client = await createManagedGmailClient(extra);
  const result = await client.getMessage(params.messageId);
  return toMcpToolResult(result);
}
