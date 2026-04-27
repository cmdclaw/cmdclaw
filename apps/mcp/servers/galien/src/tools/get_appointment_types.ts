import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_appointment_types",
  description: "Get Appointment Types (/api/v1/appointment-types)",
  annotations: {
    title: "Get Appointment Types",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getAppointmentTypes(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/appointment-types", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
