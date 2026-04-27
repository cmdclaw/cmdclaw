import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "contactPersonId": z.number().int().describe("Contact Person ID"),
};

export const metadata: ToolMetadata = {
  name: "get_contact_persons_by_contact_person_id",
  description: "Get Contact Person (/api/v1/contact-persons/{contactPersonId})",
  annotations: {
    title: "Get Contact Person",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getContactPersonsByContactPersonId(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/contact-persons/{contactPersonId}", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
