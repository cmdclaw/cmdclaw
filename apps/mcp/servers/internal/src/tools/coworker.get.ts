import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { createMcpClient } from "../lib/client";
import { handleCoworkerGet } from "../lib/handlers";

export const schema = {
  reference: z.string().describe("Coworker ID or @username"),
  serverUrl: z.string().url().optional().describe("Override the CmdClaw server URL"),
};

export const metadata: ToolMetadata = {
  name: "coworker.get",
  description: "Get a coworker by ID or @username",
  annotations: {
    title: "Get coworker",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function coworkerGet(params: InferSchema<typeof schema>) {
  const clientState = createMcpClient(params.serverUrl);
  if (clientState.status !== "ready") {
    return clientState;
  }
  return handleCoworkerGet(clientState.client, params.reference);
}
