import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "userId": z.number().int().describe("User id"),
  "startDate": galienQueryValueSchema.describe("Start date of visit report"),
  "endDate": galienQueryValueSchema.describe("End date of visit report"),
  "size": galienQueryValueSchema.optional().describe("Number of items to return"),
  "offset": galienQueryValueSchema.optional().describe("Offset from which the list of items should be returned"),
};

export const metadata: ToolMetadata = {
  name: "get_users_by_user_id_visit_reports",
  description: "Get user's visit reports (/api/v1/users/{userId}/visit-reports)",
  annotations: {
    title: "Get user's visit reports",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getUsersByUserIdVisitReports(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/users/{userId}/visit-reports", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
