import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_plv_lists",
  description: "Get PLV values (/api/v1/plv-lists)",
  annotations: {
    title: "Get PLV values",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getPlvLists(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/plv-lists", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
