import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_potentials",
  description: "Get Potentials (/api/v1/potentials)",
  annotations: {
    title: "Get Potentials",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getPotentials(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/potentials", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
