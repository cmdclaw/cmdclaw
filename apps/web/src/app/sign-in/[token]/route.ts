import { NextResponse } from "next/server";
import { buildRequestAwareUrl, getRequestAwareOrigin } from "@/lib/request-aware-url";
import { getMagicLinkRequestState } from "@/server/lib/magic-link-request-state";

function redirectToLoginError(requestUrl: string) {
  return NextResponse.redirect(buildRequestAwareUrl("/login?error=magic-link", requestUrl));
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestState = await getMagicLinkRequestState(token);

  if (!requestState) {
    return redirectToLoginError(request.url);
  }

  const verificationUrl = new URL(
    "/api/auth/magic-link/verify",
    getRequestAwareOrigin(request.url),
  );
  verificationUrl.searchParams.set("token", token);

  if (requestState.callbackUrl) {
    verificationUrl.searchParams.set("callbackURL", requestState.callbackUrl);
  }

  if (requestState.newUserCallbackUrl) {
    verificationUrl.searchParams.set("newUserCallbackURL", requestState.newUserCallbackUrl);
  }

  if (requestState.errorCallbackUrl) {
    verificationUrl.searchParams.set("errorCallbackURL", requestState.errorCallbackUrl);
  }

  return NextResponse.redirect(verificationUrl);
}
