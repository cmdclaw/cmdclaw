import {
  buildSyntheticContact,
  contactsListQuerySchema,
  contactsListResponseSchema,
  createContactInputSchema,
  listContacts,
  readJsonBody,
  validationErrorResponse,
} from "@/lib/mock-openapi/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = contactsListQuerySchema.safeParse({
    email: url.searchParams.get("email") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const data = listContacts(parsed.data);
  return Response.json(contactsListResponseSchema.parse({ data, count: data.length }));
}

export async function POST(request: Request) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = createContactInputSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  return Response.json(buildSyntheticContact(parsed.data));
}
