import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "filters": z.array(z.string()).optional().describe("Array of filters"),
  "currentLocationLongitude": galienQueryValueSchema.optional().describe("Field containing the current longitude of the user, which is used alongside the “range” filter."),
  "currentLocationLatitude": galienQueryValueSchema.optional().describe("Field containing the current latitude of the user, which is used alongside “range” filter"),
  "size": galienQueryValueSchema.optional().describe("Number of items to return"),
  "offset": galienQueryValueSchema.optional().describe("Offset from which the list of items should be returned"),
  "source": galienQueryValueSchema.optional().describe("Source of the request, example: map"),
  "timezoneOffset": galienQueryValueSchema.optional().describe("Timezone Offset"),
};

export const metadata: ToolMetadata = {
  name: "get_clients",
  description: "Get Clients List (/api/v1/clients)",
  annotations: {
    title: "Get Clients List",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getClients(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/clients", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
