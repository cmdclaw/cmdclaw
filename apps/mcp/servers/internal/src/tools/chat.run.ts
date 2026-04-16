import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { createMcpClient } from "../lib/client";
import { handleChatRun } from "../lib/handlers";

export const schema = {
  message: z.string().describe("The prompt to send to CmdClaw chat"),
  conversationId: z.string().optional().describe("Existing conversation ID to continue"),
  model: z.string().optional().describe("Model reference to use"),
  authSource: z.enum(["user", "shared"]).optional().describe("Model auth source"),
  sandbox: z.enum(["e2b", "daytona", "docker"]).optional().describe("Sandbox provider"),
  autoApprove: z.boolean().optional().describe("Auto-approve tool calls"),
  serverUrl: z.string().url().optional().describe("Override the CmdClaw server URL"),
};

export const metadata: ToolMetadata = {
  name: "chat.run",
  description: "Run a CmdClaw chat turn and return a structured result",
  annotations: {
    title: "Run chat",
    idempotentHint: false,
    readOnlyHint: false,
  },
};

export default async function chatRun(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const clientState = createMcpClient(extra, params.serverUrl);
  if (clientState.status !== "ready") {
    return clientState;
  }
  return handleChatRun({
    client: clientState.client,
    message: params.message,
    conversationId: params.conversationId,
    model: params.model,
    authSource: params.authSource,
    sandbox: params.sandbox,
    autoApprove: params.autoApprove,
  });
}
