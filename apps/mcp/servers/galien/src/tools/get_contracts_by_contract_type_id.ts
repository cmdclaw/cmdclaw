import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "contractTypeId": z.number().int().describe("Contract type Id"),
  "clientId": galienQueryValueSchema.optional().describe("Client Id"),
};

export const metadata: ToolMetadata = {
  name: "get_contracts_by_contract_type_id",
  description: "Get Contracts (/api/v1/contracts/{contractTypeId})",
  annotations: {
    title: "Get Contracts",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getContractsByContractTypeId(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/contracts/{contractTypeId}", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
