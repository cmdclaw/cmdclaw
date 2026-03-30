import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { createMcpClient } from "../lib/client";
import { handleCoworkerRun } from "../lib/handlers";

export const schema = {
  reference: z.string().describe("Coworker ID or @username"),
  payload: z.record(z.string(), z.unknown()).optional().describe("Optional run payload"),
  serverUrl: z.string().url().optional().describe("Override the CmdClaw server URL"),
};

export const metadata: ToolMetadata = {
  name: "coworker.run",
  description: "Trigger a coworker run",
  annotations: {
    title: "Run coworker",
    readOnlyHint: false,
    idempotentHint: false,
  },
};

export default async function coworkerRun(params: InferSchema<typeof schema>) {
  const clientState = createMcpClient(params.serverUrl);
  if (clientState.status !== "ready") {
    return clientState;
  }
  return handleCoworkerRun({
    client: clientState.client,
    reference: params.reference,
    payload: params.payload,
  });
}
