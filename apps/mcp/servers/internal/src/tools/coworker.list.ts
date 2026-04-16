import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { createMcpClient } from "../lib/client";
import { handleCoworkerList } from "../lib/handlers";

export const schema = {
  serverUrl: z.string().url().optional().describe("Override the CmdClaw server URL"),
};

export const metadata: ToolMetadata = {
  name: "coworker.list",
  description: "List available coworkers",
  annotations: {
    title: "List coworkers",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function coworkerList(params: InferSchema<typeof schema>) {
  const clientState = createMcpClient(params.serverUrl);
  if (clientState.status !== "ready") {
    return clientState;
  }
  return handleCoworkerList(clientState.client);
}
