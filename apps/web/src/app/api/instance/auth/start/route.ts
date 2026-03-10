import { startCloudAuth } from "@cmdclaw/core/server/control-plane/client";
import { isSelfHostedEdition } from "@cmdclaw/core/server/edition";
import { NextResponse } from "next/server";
import { sanitizeReturnPath } from "@/server/control-plane/return-path";

function buildLoginRedirect(requestUrl: string, callbackUrl: string, error: string) {
  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = sanitizeReturnPath(url.searchParams.get("callbackUrl"), "/chat");

  if (!isSelfHostedEdition()) {
    return buildLoginRedirect(request.url, callbackUrl, "cloud_auth_not_available");
  }

  try {
    const authorizeUrl = await startCloudAuth({ returnPath: callbackUrl });
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start cloud login";
    const errorKey =
      message === "Cloud control plane is not configured"
        ? "cloud_auth_not_configured"
        : "cloud_auth_unavailable";
    return buildLoginRedirect(request.url, callbackUrl, errorKey);
  }
}
