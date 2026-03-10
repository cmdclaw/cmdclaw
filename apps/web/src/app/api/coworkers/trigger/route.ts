import { triggerCoworkerRun } from "@cmdclaw/core/server/services/coworker-service";
import { NextResponse } from "next/server";
import { env } from "@/env";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = env.CMDCLAW_SERVER_SECRET ? `Bearer ${env.CMDCLAW_SERVER_SECRET}` : "";

  if (!expected || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const coworkerId = body?.coworkerId;
    const payload = body?.payload ?? {};

    if (!coworkerId || typeof coworkerId !== "string") {
      return NextResponse.json({ error: "coworkerId is required" }, { status: 400 });
    }

    const result = await triggerCoworkerRun({
      coworkerId,
      triggerPayload: payload,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Coworker trigger error:", error);
    return NextResponse.json({ error: "Failed to trigger coworker" }, { status: 500 });
  }
}
