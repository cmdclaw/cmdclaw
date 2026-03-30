import {
  buildPatchedContact,
  findContactById,
  notFoundResponse,
  readJsonBody,
  requireMockCrmAuth,
  updateContactInputSchema,
  validationErrorResponse,
} from "@/lib/mock-openapi/crm";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const unauthorized = requireMockCrmAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;
  const contact = findContactById(id);
  if (!contact) {
    return notFoundResponse("contact", id);
  }

  return Response.json(contact);
}

export async function PATCH(request: Request, context: RouteContext) {
  const unauthorized = requireMockCrmAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;
  const existing = findContactById(id);
  if (!existing) {
    return notFoundResponse("contact", id);
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = updateContactInputSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  return Response.json(buildPatchedContact(existing, parsed.data));
}
