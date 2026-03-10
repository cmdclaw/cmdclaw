import {
  exchangeCloudAuth,
  isControlPlaneEnabled,
} from "@cmdclaw/core/server/control-plane/client";
import { consumeControlPlaneAuthState } from "@cmdclaw/core/server/control-plane/local-auth";
import { NextResponse } from "next/server";
import { sanitizeReturnPath } from "@/server/control-plane/return-path";
import {
  createLocalSessionRedirectResponse,
  resolveOrCreateLocalUserFromCloudIdentity,
} from "@/server/control-plane/selfhost-auth";

function redirectToLogin(requestUrl: string, callbackUrl: string, error: string) {
  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!isControlPlaneEnabled()) {
    return redirectToLogin(request.url, "/chat", "cloud_auth_not_available");
  }

  if (!code || !state) {
    return redirectToLogin(request.url, "/chat", "missing_params");
  }

  const authState = await consumeControlPlaneAuthState(state);
  if (!authState) {
    return redirectToLogin(request.url, "/chat", "invalid_state");
  }

  const callbackUrl = sanitizeReturnPath(authState.returnPath, "/chat");

  try {
    const identity = await exchangeCloudAuth(code);
    const userId = await resolveOrCreateLocalUserFromCloudIdentity(identity);
    const redirectUrl = new URL(callbackUrl, request.url);
    return createLocalSessionRedirectResponse({
      userId,
      redirectUrl,
      requestUrl: request.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete cloud login";
    const errorKey =
      message === "Cloud control plane is not configured"
        ? "cloud_auth_not_configured"
        : message.includes("Invalid or incomplete code") || message.includes("Invalid")
          ? "invalid_code"
          : message.includes("different cloud account")
            ? "account_conflict"
            : "cloud_auth_unavailable";
    return redirectToLogin(request.url, callbackUrl, errorKey);
  }
}
