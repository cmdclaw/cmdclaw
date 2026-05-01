import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestCurrentGalienUserGet } from "../lib/tool-helpers";

export const schema = {
  "productLineNames": galienQueryValueSchema.optional().describe("Array of product line names"),
  "targetTypeIds": galienQueryValueSchema.optional().describe("Array of target type ids"),
  "groupIds": galienQueryValueSchema.optional().describe("Array of group type ids"),
};

export const metadata: ToolMetadata = {
  name: "get_my_turnover",
  description:
    "Get the authenticated Galien user's turnover. Use this for 'my turnover', 'mon chiffre d'affaires', or current-user Galien turnover. The userId is read from the login JWT.",
  annotations: {
    title: "Get My Turnover",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getMyTurnover(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestCurrentGalienUserGet("/api/v1/users/{userId}/turnover", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
