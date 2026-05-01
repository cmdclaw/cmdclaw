import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": z.string().describe("clientId parameter"),
};

export const metadata: ToolMetadata = {
  name: "get_clients_by_client_id_contract_types",
  description: "Get Clients Contract Types. (/api/v1/clients/{clientId}/contract-types)",
  annotations: {
    title: "Get Clients Contract Types.",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClientsByClientIdContractTypes(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients/{clientId}/contract-types", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
