import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "destructionCertificateId": z.number().int().describe("Destruction Certificate Id"),
};

export const metadata: ToolMetadata = {
  name: "get_destruction_certificates_by_destruction_certificate_id_generate",
  description: "Download Destruction Certificate PDF (/api/v1/destructionCertificates/{destructionCertificateId}/generate)",
  annotations: {
    title: "Download Destruction Certificate PDF",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getDestructionCertificatesByDestructionCertificateIdGenerate(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/destructionCertificates/{destructionCertificateId}/generate", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
