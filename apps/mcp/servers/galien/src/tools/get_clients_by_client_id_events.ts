import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Clients id"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_events",
  description: "Get Clients Events (/api/v1/clients/{clientId}/events)",
  annotations: {
    title: "Get Clients Events",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdEvents(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/events", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
