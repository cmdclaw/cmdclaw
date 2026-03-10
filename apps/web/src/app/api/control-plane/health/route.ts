import { NextResponse } from "next/server";
import { assertValidInstanceApiKey } from "@/server/control-plane/auth";

export async function GET(request: Request) {
  try {
    assertValidInstanceApiKey(request);
    return NextResponse.json({
      ok: true,
      edition: "cloud" as const,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
