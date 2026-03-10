import { db } from "@cmdclaw/db/client";
import { controlPlaneLinkRequest } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  assertCloudControlPlaneEnabled,
  getValidLinkRequest,
  requireCloudSession,
} from "@/server/control-plane/auth";

export async function GET(request: Request) {
  try {
    assertCloudControlPlaneEnabled();
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!code) {
      return NextResponse.json({ message: "Missing code" }, { status: 400 });
    }

    const pending = await getValidLinkRequest(code);
    if (!pending) {
      return NextResponse.json({ message: "Invalid or expired code" }, { status: 400 });
    }

    const sessionData = await requireCloudSession(request);
    if (!sessionData?.user?.id) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", url.pathname + url.search);
      return NextResponse.redirect(loginUrl);
    }

    await db
      .update(controlPlaneLinkRequest)
      .set({
        completedByUserId: sessionData.user.id,
      })
      .where(eq(controlPlaneLinkRequest.code, code));

    const redirectUrl = new URL(pending.returnUrl);
    redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("state", pending.localState);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to authorize link" },
      { status: 500 },
    );
  }
}
