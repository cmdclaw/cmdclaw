import { db } from "@cmdclaw/db/client";
import { integration } from "@cmdclaw/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertValidInstanceApiKey } from "@/server/control-plane/auth";

export async function POST(request: Request) {
  try {
    assertValidInstanceApiKey(request);
    const body = (await request.json()) as {
      cloudUserId?: string;
      integrationId?: string;
      enabled?: boolean;
    };
    if (!body.cloudUserId || !body.integrationId || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { message: "Missing cloudUserId, integrationId, or enabled" },
        { status: 400 },
      );
    }

    await db
      .update(integration)
      .set({ enabled: body.enabled })
      .where(and(eq(integration.userId, body.cloudUserId), eq(integration.id, body.integrationId)));

    return NextResponse.json({ success: true as const });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
