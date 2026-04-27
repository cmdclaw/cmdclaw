import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "userId": z.number().int().describe("User id"),
};

export const metadata: ToolMetadata = {
  name: "get_users_by_user_id",
  description: "Get User (/api/v1/users/{userId})",
  annotations: {
    title: "Get User",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getUsersByUserId(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/users/{userId}", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
