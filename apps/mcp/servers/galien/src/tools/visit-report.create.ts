import { z } from "zod";
import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { requestGalienForCurrentUserBodyField } from "../lib/galien-client";
import { getManagedGalienToolCredentials } from "../lib/galien-auth";
import { galienIsoDateTimeSchema, validateGalienToolParams } from "../lib/tool-helpers";

export const GALIEN_VISIT_REPORT_CURRENT_VERSION = "v5";
export const BAP_VISIT_REPORT_COMMENT_MARKER = "(made by Bap)";

export const schema = {
  clientId: z.number().int().describe("Galien client/pharmacy id, for example 14."),
  contactPersonId: z.number().int().describe("Galien contact person id for the client."),
  contactOutcomeId: z
    .number()
    .int()
    .describe("Galien contact outcome id. For a visit, use an outcome whose type is Visite, for example 20."),
  visitDate: galienIsoDateTimeSchema
    .describe(
      "Visit date. Use a past or current ISO 8601 UTC datetime with milliseconds, for example 2026-04-28T10:00:00.000Z. Galien may reject future visit dates.",
    ),
  duration: z
    .number()
    .int()
    .positive()
    .describe("Duration in seconds. Use 1800 for a 30-minute visit."),
  contactTypeId: z
    .union([z.literal(1), z.literal(2)])
    .default(1)
    .describe("Galien contact type id: 1 for Visite, 2 for Appel. Defaults to 1."),
  comment: z.string().optional().describe("Free-text report comment."),
  localisation: z.number().int().optional().describe("v5 visit field. Defaults to 1 for Visite."),
  pharmacySize: z.number().int().optional().describe("v5 visit field. Defaults to 1 for Visite."),
  averagePassagesPerDay: z.number().int().optional().describe("v5 visit field. Defaults to 1 for Visite."),
};

export type VisitReportCreateParams = z.infer<z.ZodObject<typeof schema>>;

const GALIEN_VISIT_CONTACT_TYPE_ID = 1;
const DEFAULT_VISIT_REPORT_V5_FIELDS: Partial<VisitReportCreateParams> = {
  localisation: 1,
  pharmacySize: 1,
  averagePassagesPerDay: 1,
};

export const metadata: ToolMetadata = {
  name: "visit-report.create",
  description:
    "Create a Galien visit report with POST /api/v1/visit-reports. For normal visits, send the required ids, a past/current visitDate, duration in seconds, and avoid extra PLV/training/promotion fields because Galien preprod returns opaque 400 errors for unsupported combinations.",
  annotations: {
    title: "Create visit report",
  },
};

export function addBapCommentMarker(comment?: string) {
  const existingComment = comment ?? "";
  const trimmedComment = existingComment.trim();

  if (!trimmedComment) {
    return BAP_VISIT_REPORT_COMMENT_MARKER;
  }

  if (existingComment.includes(BAP_VISIT_REPORT_COMMENT_MARKER)) {
    return existingComment;
  }

  return `${existingComment.trimEnd()}\n\n${BAP_VISIT_REPORT_COMMENT_MARKER}`;
}

export function buildVisitReportCreateBody(params: VisitReportCreateParams) {
  const defaultFields = params.contactTypeId === GALIEN_VISIT_CONTACT_TYPE_ID
    ? DEFAULT_VISIT_REPORT_V5_FIELDS
    : {};

  return {
    ...defaultFields,
    ...params,
    comment: addBapCommentMarker(params.comment),
    version: GALIEN_VISIT_REPORT_CURRENT_VERSION,
  };
}

export default async function createVisitReport(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const validatedParams = validateGalienToolParams(schema, params);
  const credentials = await getManagedGalienToolCredentials(extra);
  const result = await requestGalienForCurrentUserBodyField({
    method: "POST",
    path: "/api/v1/visit-reports",
    body: buildVisitReportCreateBody(validatedParams),
  }, "userId", credentials);
  return toMcpToolResult(result);
}
