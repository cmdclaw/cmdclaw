import { db } from "@cmdclaw/db/client";
import { controlPlaneLinkRequest } from "@cmdclaw/db/schema";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { assertValidInstanceApiKey } from "@/server/control-plane/auth";

export async function POST(request: Request) {
  try {
    assertValidInstanceApiKey(request);
    const body = (await request.json()) as {
      localState?: string;
      returnUrl?: string;
      requestedIntegrationType?: string | null;
    };

    if (!body.localState || !body.returnUrl) {
      return NextResponse.json({ message: "Missing localState or returnUrl" }, { status: 400 });
    }

    const code = crypto.randomUUID();
    await db.insert(controlPlaneLinkRequest).values({
      code,
      localState: body.localState,
      returnUrl: body.returnUrl,
      requestedIntegrationType: body.requestedIntegrationType ?? null,
    });

    const appUrl = env.APP_URL ?? env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ message: "APP_URL is not configured" }, { status: 500 });
    }

    return NextResponse.json({
      authorizeUrl: `${appUrl}/api/control-plane/link/authorize?code=${encodeURIComponent(code)}`,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
