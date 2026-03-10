import { db } from "@cmdclaw/db/client";
import { controlPlaneLinkRequest } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertValidInstanceApiKey, getValidLinkRequest } from "@/server/control-plane/auth";

export async function POST(request: Request) {
  try {
    assertValidInstanceApiKey(request);
    const body = (await request.json()) as { code?: string };
    if (!body.code) {
      return NextResponse.json({ message: "Missing code" }, { status: 400 });
    }

    const pending = await getValidLinkRequest(body.code);
    if (!pending?.completedByUserId || pending.completedAt) {
      return NextResponse.json({ message: "Invalid or incomplete code" }, { status: 400 });
    }

    await db
      .update(controlPlaneLinkRequest)
      .set({
        completedAt: new Date(),
      })
      .where(eq(controlPlaneLinkRequest.code, body.code));

    return NextResponse.json({
      cloudUserId: pending.completedByUserId,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
