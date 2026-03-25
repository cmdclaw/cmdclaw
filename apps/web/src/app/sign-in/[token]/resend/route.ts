import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildSignInMagicLinkPath } from "@/lib/magic-link-request";
import { buildRequestAwareUrl } from "@/lib/request-aware-url";
import { resolveMagicLinkPageState } from "@/server/lib/magic-link-request-state";
import { isSameOriginRequest } from "@/server/lib/same-origin";

export const runtime = "nodejs";

function redirectToMagicLinkPage(request: Request, token: string, resent = false) {
  const url = buildRequestAwareUrl(buildSignInMagicLinkPath(token), request);
  if (resent) {
    url.searchParams.set("resent", "1");
  }
  return NextResponse.redirect(url);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { token } = await params;
  const state = await resolveMagicLinkPageState(token);

  if (state.status === "pending") {
    return new NextResponse("Conflict", { status: 409 });
  }

  if (state.status === "invalid") {
    return redirectToMagicLinkPage(request, token);
  }

  await auth.api.signInMagicLink({
    body: {
      email: state.email,
      ...(state.callbackUrl ? { callbackURL: state.callbackUrl } : {}),
      ...(state.newUserCallbackUrl ? { newUserCallbackURL: state.newUserCallbackUrl } : {}),
      ...(state.errorCallbackUrl ? { errorCallbackURL: state.errorCallbackUrl } : {}),
    },
    headers: request.headers,
  });

  return redirectToMagicLinkPage(request, token, true);
}
