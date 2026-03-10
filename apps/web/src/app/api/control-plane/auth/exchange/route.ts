import { db } from "@cmdclaw/db/client";
import { controlPlaneAuthRequest, user } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertValidInstanceApiKey, getValidAuthRequest } from "@/server/control-plane/auth";

export async function POST(request: Request) {
  try {
    assertValidInstanceApiKey(request);
    const body = (await request.json()) as { code?: string };
    if (!body.code) {
      return NextResponse.json({ message: "Missing code" }, { status: 400 });
    }

    const pending = await getValidAuthRequest(body.code);
    if (!pending?.completedByUserId || pending.completedAt) {
      return NextResponse.json({ message: "Invalid or incomplete code" }, { status: 400 });
    }

    const cloudUser = await db.query.user.findFirst({
      where: eq(user.id, pending.completedByUserId),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
      },
    });

    if (!cloudUser) {
      return NextResponse.json({ message: "Cloud user not found" }, { status: 404 });
    }

    await db
      .update(controlPlaneAuthRequest)
      .set({
        completedAt: new Date(),
      })
      .where(eq(controlPlaneAuthRequest.code, body.code));

    return NextResponse.json({
      cloudUserId: cloudUser.id,
      email: cloudUser.email,
      name: cloudUser.name,
      image: cloudUser.image,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
