import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "contractTypeId": z.number().int().describe("Contract type id"),
  "clientId": z.number().int().describe("Client id"),
};

export const metadata: ToolMetadata = {
  name: "get_contract_types_by_contract_type_id_form_by_client_id",
  description: "Get Contract Type Form (/api/v1/contract-types/{contractTypeId}/form/{clientId})",
  annotations: {
    title: "Get Contract Type Form",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getContractTypesByContractTypeIdFormByClientId(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/contract-types/{contractTypeId}/form/{clientId}", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
