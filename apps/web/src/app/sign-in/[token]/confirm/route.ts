import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildSignInMagicLinkPath } from "@/lib/magic-link-request";
import { buildRequestAwareUrl, getRequestAwareOrigin } from "@/lib/request-aware-url";
import {
  markMagicLinkRequestConsumed,
  resolveMagicLinkPageState,
} from "@/server/lib/magic-link-request-state";
import { isSameOriginRequest } from "@/server/lib/same-origin";

export const runtime = "nodejs";

function redirectToMagicLinkPage(request: Request, token: string, error?: string) {
  const url = buildRequestAwareUrl(buildSignInMagicLinkPath(token), request);
  if (error) {
    url.searchParams.set("error", error);
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

  if (state.status !== "pending") {
    return redirectToMagicLinkPage(request, token);
  }

  const signInPath = buildSignInMagicLinkPath(token);
  const response = await auth.api.magicLinkVerify({
    query: {
      token,
      ...(state.callbackUrl ? { callbackURL: state.callbackUrl } : {}),
      ...(state.newUserCallbackUrl ? { newUserCallbackURL: state.newUserCallbackUrl } : {}),
      errorCallbackURL: signInPath,
    },
    headers: request.headers,
    asResponse: true,
  });

  const location = response.headers.get("location");
  if (location) {
    const redirectUrl = new URL(location, getRequestAwareOrigin(request));
    const redirectError = redirectUrl.searchParams.get("error");

    if (redirectUrl.pathname === signInPath && redirectError) {
      if (redirectError !== "EXPIRED_TOKEN") {
        await markMagicLinkRequestConsumed(token);
      }

      if (redirectError === "INVALID_TOKEN" || redirectError === "EXPIRED_TOKEN") {
        return redirectToMagicLinkPage(request, token);
      }

      return redirectToMagicLinkPage(request, token, redirectError);
    }
  }

  await markMagicLinkRequestConsumed(token);
  return response;
}
