import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_contact_types",
  description: "Get Contact Types (/api/v1/contact-types)",
  annotations: {
    title: "Get Contact Types",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getContactTypes(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/contact-types", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
