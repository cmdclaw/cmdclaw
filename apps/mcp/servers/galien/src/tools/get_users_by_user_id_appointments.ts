import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "userId": z.number().int().describe("User id"),
  "startDate": galienQueryValueSchema.optional().describe("Start date of appointment"),
  "endDate": galienQueryValueSchema.optional().describe("End date of appointment"),
  "size": galienQueryValueSchema.optional().describe("Number of items to return"),
  "offset": galienQueryValueSchema.optional().describe("Offset from which the list of items should be returned"),
};

export const metadata: ToolMetadata = {
  name: "get_users_by_user_id_appointments",
  description: "Get Users Appointments (/api/v1/users/{userId}/appointments)",
  annotations: {
    title: "Get Users Appointments",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getUsersByUserIdAppointments(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/users/{userId}/appointments", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
