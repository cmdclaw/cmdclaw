import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": galienQueryValueSchema.optional().describe("Client id"),
};

export const metadata: ToolMetadata = {
  name: "get_contract_types",
  description: "Get Contract Types (/api/v1/contract-types)",
  annotations: {
    title: "Get Contract Types",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getContractTypes(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/contract-types", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
