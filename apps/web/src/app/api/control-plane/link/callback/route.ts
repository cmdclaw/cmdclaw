import {
  exchangeCloudAccountLink,
  getCloudManagedIntegrationConnectUrl,
} from "@cmdclaw/core/server/control-plane/client";
import {
  consumeCloudAccountLinkState,
  upsertCloudAccountLinkForUser,
} from "@cmdclaw/core/server/control-plane/local-links";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ message: "Missing code or state" }, { status: 400 });
  }

  const sessionData = await auth.api.getSession({
    headers: request.headers,
  });

  if (!sessionData?.user?.id) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", url.pathname + url.search);
    return NextResponse.redirect(loginUrl);
  }

  const linkState = await consumeCloudAccountLinkState({
    state,
    userId: sessionData.user.id,
  });

  if (!linkState) {
    return NextResponse.json({ message: "Invalid or expired link state" }, { status: 400 });
  }

  const cloudUserId = await exchangeCloudAccountLink(code);
  await upsertCloudAccountLinkForUser(sessionData.user.id, cloudUserId);

  if (linkState.requestedIntegrationType) {
    return NextResponse.redirect(
      getCloudManagedIntegrationConnectUrl(linkState.requestedIntegrationType),
    );
  }

  const redirectUrl = new URL(linkState.returnPath || "/integrations", request.url);
  redirectUrl.searchParams.set("cloudLinked", "1");
  return NextResponse.redirect(redirectUrl);
}
