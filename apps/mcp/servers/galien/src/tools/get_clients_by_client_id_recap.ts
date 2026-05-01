import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Clients id"),
  "view": galienQueryValueSchema.describe("View"),
  "size": galienQueryValueSchema.optional().describe("Number of items to return"),
  "offset": galienQueryValueSchema.optional().describe("Offset from which the list of items should be returned"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_recap",
  description: "Get History Tab 1 (/api/v1/clients/{clientId}/recap)",
  annotations: {
    title: "Get History Tab 1",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdRecap(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/recap", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
