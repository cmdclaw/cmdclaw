import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienIsoDateTimeSchema, galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Clients id"),
  "size": galienQueryValueSchema.optional().describe("Max Results"),
  "offset": galienQueryValueSchema.optional().describe("Offset"),
  "startDate": galienIsoDateTimeSchema.describe("Client appointment range start. Use ISO 8601 UTC with milliseconds, for example 2026-04-28T00:00:00.000Z."),
  "endDate": galienIsoDateTimeSchema.describe("Client appointment range end. Use ISO 8601 UTC with milliseconds, for example 2026-05-04T23:59:59.999Z."),
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

export default async function getClientsByClientIdAppointments(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/appointments", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
