import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { createMcpClient } from "../lib/client";
import { handleCoworkerCreate } from "../lib/handlers";

export const schema = {
  name: z.string().optional().describe("Coworker name"),
  trigger: z.string().min(1).optional().describe("Trigger type. Defaults to manual."),
  prompt: z.string().optional().describe("Coworker instructions. Defaults to empty."),
  promptDo: z.string().optional().describe("Additional do instructions"),
  promptDont: z.string().optional().describe("Additional don't instructions"),
  folder: z.string().min(1).optional().describe("Folder path to create or reuse"),
  autoApprove: z.boolean().optional().describe("Enable auto-approve"),
  model: z.string().optional().describe("Model reference"),
  authSource: z.enum(["user", "shared"]).optional().describe("Model auth source"),
  integrations: z.array(z.string()).optional().describe("Allowed integrations"),
  serverUrl: z.string().url().optional().describe("Override the CmdClaw server URL"),
};

export const metadata: ToolMetadata = {
  name: "coworker.create",
  description: "Create a coworker",
  annotations: {
    title: "Create coworker",
    readOnlyHint: false,
    idempotentHint: false,
  },
};

export default async function coworkerCreate(
  params: InferSchema<typeof schema>,
  extra?: ToolExtraArguments,
) {
  const clientState = createMcpClient(extra, params.serverUrl);
  if (clientState.status !== "ready") {
    return toMcpToolResult(clientState);
  }
  const result = await handleCoworkerCreate({
    client: clientState.client,
    name: params.name,
    trigger: params.trigger,
    prompt: params.prompt,
    promptDo: params.promptDo,
    promptDont: params.promptDont,
    folderPath: params.folder,
    autoApprove: params.autoApprove,
    model: params.model,
    authSource: params.authSource,
    integrations: params.integrations,
  });
  return toMcpToolResult(result);
}
