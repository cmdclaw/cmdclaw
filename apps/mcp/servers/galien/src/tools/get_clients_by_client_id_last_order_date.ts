import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Client id"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_last_order_date",
  description: "Get Clients Last Order Date (/api/v1/clients/{clientId}/last-order-date)",
  annotations: {
    title: "Get Clients Last Order Date",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdLastOrderDate(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/last-order-date", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
