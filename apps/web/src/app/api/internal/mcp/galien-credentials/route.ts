import {
  canUserUseGalienInWorkspace,
  getGalienCredentialForUser,
} from "@cmdclaw/core/server/galien/service";
import { NextResponse } from "next/server";
import { env } from "@/env";

function assertValidServerSecret(request: Request) {
  const expected = env.CMDCLAW_SERVER_SECRET ? `Bearer ${env.CMDCLAW_SERVER_SECRET}` : "";
  if (!expected || request.headers.get("authorization") !== expected) {
    throw new Error("Unauthorized");
  }
}

export async function POST(request: Request) {
  try {
    assertValidServerSecret(request);
    const body = (await request.json()) as {
      userId?: string;
      workspaceId?: string;
    };

    if (!body.userId || !body.workspaceId) {
      return NextResponse.json({ message: "Missing userId or workspaceId" }, { status: 400 });
    }

    const allowed = await canUserUseGalienInWorkspace({
      userId: body.userId,
      workspaceId: body.workspaceId,
    });
    if (!allowed) {
      return NextResponse.json(
        { message: "Galien is not enabled for this user." },
        { status: 403 },
      );
    }

    const credential = await getGalienCredentialForUser({ userId: body.userId });
    if (!credential) {
      return NextResponse.json(
        { message: "Galien credentials are not connected." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      userId: body.userId,
      workspaceId: body.workspaceId,
      username: credential.username,
      password: credential.password,
      displayName: credential.displayName,
      galienUserId: credential.galienUserId,
      issuedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
