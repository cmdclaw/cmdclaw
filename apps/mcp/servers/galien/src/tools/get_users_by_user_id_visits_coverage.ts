import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "userId": z.number().int().describe("User id"),
  "startDate": galienQueryValueSchema.optional().describe("Start date of visit report"),
  "endDate": galienQueryValueSchema.optional().describe("End date of visit report"),
  "groupIds": galienQueryValueSchema.optional().describe("Array of group type ids"),
  "recentColaborationCode": galienQueryValueSchema.optional().describe("Recent colaboration code"),
  "previousColaborationCode": galienQueryValueSchema.optional().describe("Previous colaboration code"),
  "targetTypeIds": galienQueryValueSchema.optional().describe("Array of target type ids"),
};

export const metadata: ToolMetadata = {
  name: "get_users_by_user_id_visits_coverage",
  description: "Get user's visits coverage (/api/v1/users/{userId}/visits-coverage)",
  annotations: {
    title: "Get user's visits coverage",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getUsersByUserIdVisitsCoverage(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/users/{userId}/visits-coverage", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
