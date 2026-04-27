import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.number().int().describe("Clients id"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_contact_persons",
  description: "Get Clients Contact Persons (/api/v1/clients/{clientId}/contact-persons)",
  annotations: {
    title: "Get Clients Contact Persons",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdContactPersons(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/contact-persons", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
