import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "userId": galienQueryValueSchema.optional().describe("User Id"),
  "clientId": galienQueryValueSchema.optional().describe("Client Id"),
};

export const metadata: ToolMetadata = {
  name: "get_destruction_certificates",
  description: "Get Destruction Certificates (/api/v1/destructionCertificates)",
  annotations: {
    title: "Get Destruction Certificates",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getDestructionCertificates(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/destructionCertificates", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
