import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Clients' id"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id",
  description: "Get clients' details. (/api/v1/clients/{clientId})",
  annotations: {
    title: "Get clients' details.",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientId(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
