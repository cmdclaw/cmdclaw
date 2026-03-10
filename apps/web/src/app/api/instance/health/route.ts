import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInstanceHealthStatus } from "@/server/instance/health";

export async function GET(request: Request) {
  const sessionData = await auth.api.getSession({
    headers: request.headers,
  });

  if (!sessionData?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const status = await getInstanceHealthStatus();
  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
