import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Clients id"),
  "size": galienQueryValueSchema.optional().describe("Max Results"),
  "offset": galienQueryValueSchema.optional().describe("Offset"),
  "startDate": galienQueryValueSchema.optional().describe("Start date"),
  "endDate": galienQueryValueSchema.optional().describe("End date"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_appointments",
  description: "Get Clients Appointments (/api/v1/clients/{clientId}/appointments)",
  annotations: {
    title: "Get Clients Appointments",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdAppointments(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/appointments", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
