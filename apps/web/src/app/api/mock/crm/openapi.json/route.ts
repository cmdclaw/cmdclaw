import { buildMockCrmOpenApiDocument } from "@/lib/mock-openapi/crm";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json(buildMockCrmOpenApiDocument(origin));
}
