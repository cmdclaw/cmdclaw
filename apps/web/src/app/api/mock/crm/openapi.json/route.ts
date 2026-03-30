import { buildMockCrmOpenApiDocument } from "@/lib/mock-openapi/crm";
import { isInternalAppHostname } from "@/lib/request-aware-url";

function getHeaderAwareOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    const hostname = host.split(":")[0];
    if (!isInternalAppHostname(hostname)) {
      const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
      return `${proto}://${host}`;
    }
  }

  return "https://localcan.baptistecolle.com";
}

export async function GET(request: Request) {
  const origin = getHeaderAwareOrigin(request);
  return Response.json(buildMockCrmOpenApiDocument(origin));
}
