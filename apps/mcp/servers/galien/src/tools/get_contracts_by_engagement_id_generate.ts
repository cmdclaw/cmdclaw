import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "engagementId": z.number().int().describe("Engagement Id"),
};

export const metadata: ToolMetadata = {
  name: "get_contracts_by_engagement_id_generate",
  description: "Download Contract PDF (/api/v1/contracts/{engagementId}/generate)",
  annotations: {
    title: "Download Contract PDF",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getContractsByEngagementIdGenerate(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/contracts/{engagementId}/generate", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
