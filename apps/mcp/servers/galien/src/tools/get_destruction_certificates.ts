import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestCurrentGalienUserGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": galienQueryValueSchema.optional().describe("Client Id"),
};

export const metadata: ToolMetadata = {
  name: "get_my_destruction_certificates",
  description:
    "Get destruction certificates for the authenticated Galien user. Use this for 'mes certificats de destruction' or current-user Galien certificates. The userId is read from the login JWT.",
  annotations: {
    title: "Get My Destruction Certificates",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getMyDestructionCertificates(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestCurrentGalienUserGet("/api/v1/destructionCertificates", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
