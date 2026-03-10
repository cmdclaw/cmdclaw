import { db } from "@cmdclaw/db/client";
import { providerAuth } from "@cmdclaw/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertValidInstanceApiKey } from "@/server/control-plane/auth";

export async function POST(request: Request) {
  try {
    assertValidInstanceApiKey(request);
    const body = (await request.json()) as {
      cloudUserId?: string;
      provider?: string;
    };

    if (!body.cloudUserId || !body.provider) {
      return NextResponse.json({ message: "Missing cloudUserId or provider" }, { status: 400 });
    }

    await db
      .delete(providerAuth)
      .where(
        and(
          eq(providerAuth.userId, body.cloudUserId),
          eq(providerAuth.provider, body.provider as "openai" | "google" | "kimi"),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
