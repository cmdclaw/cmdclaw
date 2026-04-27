import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "reclamationId": z.number().int().describe("Reclamation Id"),
};

export const metadata: ToolMetadata = {
  name: "get_reclamations_by_reclamation_id_generate",
  description: "Download Contract PDF (/api/v1/reclamations/{reclamationId}/generate)",
  annotations: {
    title: "Download Contract PDF",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getReclamationsByReclamationIdGenerate(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/reclamations/{reclamationId}/generate", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
