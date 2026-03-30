import {
  buildSyntheticDeal,
  createDealInputSchema,
  dealsListQuerySchema,
  dealsListResponseSchema,
  findContactById,
  listDeals,
  readJsonBody,
  validationErrorResponse,
} from "@/lib/mock-openapi/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = dealsListQuerySchema.safeParse({
    contactId: url.searchParams.get("contactId") ?? undefined,
    stage: url.searchParams.get("stage") ?? undefined,
  });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const data = listDeals(parsed.data);
  return Response.json(dealsListResponseSchema.parse({ data, count: data.length }));
}

export async function POST(request: Request) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = createDealInputSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  if (!findContactById(parsed.data.contactId)) {
    return validationErrorResponse([
      {
        path: "contactId",
        message: "contactId must reference a fixture-backed contact.",
      },
    ]);
  }

  return Response.json(buildSyntheticDeal(parsed.data));
}
