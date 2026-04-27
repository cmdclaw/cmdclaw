import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "userId": z.number().int().describe("User id"),
};

export const metadata: ToolMetadata = {
  name: "get_users_by_user_id_activity",
  description: "Get Users Activity (/api/v1/users/{userId}/activity)",
  annotations: {
    title: "Get Users Activity",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getUsersByUserIdActivity(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/users/{userId}/activity", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
