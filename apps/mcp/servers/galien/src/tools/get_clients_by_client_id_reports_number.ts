import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Client's ID"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_reports_number",
  description: "Get the number of reports (ContactType = Visite) for a client. (/api/v1/clients/{clientId}/reports-number)",
  annotations: {
    title: "Get the number of reports (ContactType = Visite) for a client.",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdReportsNumber(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/reports-number", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
