import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { createManagedGmailClient } from "../lib/gmail-auth";

export const schema = {
  to: z.string().email().describe("Recipient email address"),
  subject: z.string().min(1).describe("Email subject"),
  body: z.string().min(1).describe("Email HTML or plain text body"),
  cc: z.string().optional().describe("Optional CC email address"),
  attachmentPaths: z.array(z.string()).optional().describe("Optional local file attachments"),
};

export const metadata: ToolMetadata = {
  name: "gmail.draft",
  description: "Create a Gmail draft",
  annotations: {
    title: "Create draft",
    readOnlyHint: false,
    idempotentHint: false,
  },
};

export default async function gmailDraft(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const client = await createManagedGmailClient(extra);
  return client.createDraft(params);
}
