import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_groupments",
  description: "Get Groupments (/api/v1/groupments)",
  annotations: {
    title: "Get Groupments",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getGroupments(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/groupments", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
