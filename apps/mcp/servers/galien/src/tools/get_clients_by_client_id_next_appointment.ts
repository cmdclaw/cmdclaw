import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("ID of the client"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_next_appointment",
  description: "Get the next appointment for a client (/api/v1/clients/{clientId}/next-appointment)",
  annotations: {
    title: "Get the next appointment for a client",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdNextAppointment(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/next-appointment", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
