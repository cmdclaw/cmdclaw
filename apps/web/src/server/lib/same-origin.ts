import { getRequestAwareOrigin } from "@/lib/request-aware-url";

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === getRequestAwareOrigin(request);
  } catch {
    return false;
  }
}
