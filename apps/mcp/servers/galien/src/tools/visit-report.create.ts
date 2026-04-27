import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { requestGalien } from "../lib/galien-client";

export const schema = {
  clientId: z.number().int().optional(),
  contactPersonId: z.number().int().optional(),
  contactOutcomeId: z.number().int().optional(),
  visitDate: z.string().optional(),
  duration: z.number().int().optional(),
  contactTypeId: z.number().int().optional(),
  numberOfPersons: z.number().int().optional(),
  training1: z.number().int().optional(),
  training2: z.number().int().optional(),
  otherTraining: z.string().optional(),
  otherTrainingComment: z.string().optional(),
  comment: z.string().optional(),
  qualification1: z.number().int().optional(),
  qualification2: z.number().int().optional(),
  retrocession: z.boolean().optional(),
  promotion: z.boolean().optional(),
  promotionMonth: z.string().optional(),
  previousSellOut: z.union([z.boolean(), z.number()]).optional(),
  currentSellOut: z.union([z.boolean(), z.number()]).optional(),
  plvOptions: z
    .array(
      z.object({
        plvLabel: z.string().optional(),
        optionsIds: z.array(z.number().int()).optional(),
      }),
    )
    .optional(),
};

export const metadata: ToolMetadata = {
  name: "visit-report.create",
  description: "Create a Galien visit report with POST /api/v1/visit-reports",
  annotations: {
    title: "Create visit report",
  },
};

export default async function createVisitReport(params: InferSchema<typeof schema>) {
  const result = await requestGalien({
    method: "POST",
    path: "/api/v1/visit-reports",
    body: params,
  });
  return toMcpToolResult(result);
}
