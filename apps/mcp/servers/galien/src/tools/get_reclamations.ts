import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestCurrentGalienUserGet } from "../lib/tool-helpers";

export const schema = {
  "clientId": galienQueryValueSchema.optional().describe("Client id"),
};

export const metadata: ToolMetadata = {
  name: "get_my_reclamations",
  description:
    "Get reclamations for the authenticated Galien user. Use this for 'mes réclamations' or current-user Galien reclamations. The userId is read from the login JWT.",
  annotations: {
    title: "Get My Reclamations",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getMyReclamations(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestCurrentGalienUserGet("/api/v1/reclamations", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
