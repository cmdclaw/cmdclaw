import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_target_3_types",
  description: "Get Target Types 3 (/api/v1/target-3-types)",
  annotations: {
    title: "Get Target Types 3",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getTarget3Types(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/target-3-types", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
