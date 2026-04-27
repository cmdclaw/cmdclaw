import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "userId": z.number().int().describe("User id"),
  "productLineNames": galienQueryValueSchema.optional().describe("Array of product line names"),
  "targetTypeIds": galienQueryValueSchema.optional().describe("Array of target type ids"),
  "groupIds": galienQueryValueSchema.optional().describe("Array of group type ids"),
};

export const metadata: ToolMetadata = {
  name: "get_users_by_user_id_turnover",
  description: "Get Users Turnover (/api/v1/users/{userId}/turnover)",
  annotations: {
    title: "Get Users Turnover",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getUsersByUserIdTurnover(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/users/{userId}/turnover", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
