import {
  getEnabledIntegrationTypes,
  getTokensForIntegrations,
} from "@cmdclaw/core/server/integrations/cli-env";
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
      integrationTypes?: string[];
    };

    if (!body.userId) {
      return NextResponse.json({ message: "Missing userId" }, { status: 400 });
    }

    return NextResponse.json({
      userId: body.userId,
      workspaceId: body.workspaceId ?? null,
      tokens: await getTokensForIntegrations(body.userId, body.integrationTypes ?? []),
      enabledIntegrations: await getEnabledIntegrationTypes(body.userId),
      issuedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
