import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_target_1_types",
  description: "Get Target Types 1 (/api/v1/target-1-types)",
  annotations: {
    title: "Get Target Types 1",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getTarget1Types(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/target-1-types", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
