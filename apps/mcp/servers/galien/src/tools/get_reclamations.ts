import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "userId": galienQueryValueSchema.optional().describe("User id"),
  "clientId": galienQueryValueSchema.optional().describe("Client id"),
};

export const metadata: ToolMetadata = {
  name: "get_reclamations",
  description: "Get Reclamations (/api/v1/reclamations)",
  annotations: {
    title: "Get Reclamations",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getReclamations(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/reclamations", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
