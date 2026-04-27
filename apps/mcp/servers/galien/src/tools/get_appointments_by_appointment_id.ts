import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "appointmentId": z.number().int().describe("Appointment id"),
  "action": galienQueryValueSchema.describe("Action Type"),
};

export const metadata: ToolMetadata = {
  name: "get_appointments_by_appointment_id",
  description: "Get Appointment Details (/api/v1/appointments/{appointmentId})",
  annotations: {
    title: "Get Appointment Details",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getAppointmentsByAppointmentId(params: InferSchema<typeof schema>) {
  const result = await requestGalienGet("/api/v1/appointments/{appointmentId}", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>);
  return toMcpToolResult(result);
}
