import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_product_lines",
  description: "Get Product Lines (/api/v1/product-lines)",
  annotations: {
    title: "Get Product Lines",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getProductLines(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/product-lines", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
