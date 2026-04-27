import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Client id"),
  "isVisitReportPage": galienQueryValueSchema.optional().describe("Check if request happens on a specific page"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_last_visit_report",
  description: "Get Clients Last Visit Report (/api/v1/clients/{clientId}/last-visit-report)",
  annotations: {
    title: "Get Clients Last Visit Report",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdLastVisitReport(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/last-visit-report", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
