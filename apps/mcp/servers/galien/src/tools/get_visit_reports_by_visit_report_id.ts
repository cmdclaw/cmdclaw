import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { galienQueryValueSchema, requestGalienGet } from "../lib/tool-helpers";

export const schema = {
  "visitReportId": z.number().int().describe("Visit report id"),
};

export const metadata: ToolMetadata = {
  name: "get_visit_reports_by_visit_report_id",
  description: "Get Visit Report (/api/v1/visit-reports/{visitReportId})",
  annotations: {
    title: "Get Visit Report",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getVisitReportsByVisitReportId(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestGalienGet("/api/v1/visit-reports/{visitReportId}", params as Record<string, string | number | boolean | Array<string | number | boolean> | undefined>, extra);
  return toMcpToolResult(result);
}
