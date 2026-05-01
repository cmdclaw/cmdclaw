import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "appointmentId": z.number().int().describe("Appointment id"),
  "clientPageUrl": galienQueryValueSchema.describe("Client Page URL"),
};

export const metadata: ToolMetadata = {
  name: "get_appointments_by_appointment_id_ics",
  description: "Get Appointment ICS File (/api/v1/appointments/{appointmentId}/ics)",
  annotations: {
    title: "Get Appointment ICS File",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getAppointmentsByAppointmentIdIcs(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/appointments/{appointmentId}/ics", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
