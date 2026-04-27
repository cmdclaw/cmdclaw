import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Clients id"),
  "size": galienQueryValueSchema.optional().describe("Number of items to return"),
  "offset": galienQueryValueSchema.optional().describe("Offset from which the list of items should be returned"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_engagements_history",
  description: "Get Clients Engagements (/api/v1/clients/{clientId}/engagements-history)",
  annotations: {
    title: "Get Clients Engagements",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdEngagementsHistory(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/engagements-history", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
