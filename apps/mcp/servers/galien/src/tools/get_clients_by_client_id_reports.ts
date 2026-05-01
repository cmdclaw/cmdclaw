import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Clients id"),
  "size": galienQueryValueSchema.optional().describe("Max Results"),
  "offset": galienQueryValueSchema.optional().describe("Offset"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_reports",
  description: "Get Clients Reports (/api/v1/clients/{clientId}/reports)",
  annotations: {
    title: "Get Clients Reports",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdReports(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/reports", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
