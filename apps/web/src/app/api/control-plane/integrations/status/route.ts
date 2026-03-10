import { db } from "@cmdclaw/db/client";
import { integration } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertValidInstanceApiKey } from "@/server/control-plane/auth";

export async function POST(request: Request) {
  try {
    assertValidInstanceApiKey(request);
    const body = (await request.json()) as { cloudUserId?: string };
    if (!body.cloudUserId) {
      return NextResponse.json({ message: "Missing cloudUserId" }, { status: 400 });
    }

    const integrations = await db.query.integration.findMany({
      where: eq(integration.userId, body.cloudUserId),
    });

    return NextResponse.json(
      integrations.map((item) => {
        const metadata =
          typeof item.metadata === "object" && item.metadata !== null
            ? (item.metadata as Record<string, unknown>)
            : null;

        return {
          id: item.id,
          type: item.type,
          displayName: item.displayName ?? null,
          enabled: item.enabled,
          setupRequired: item.type === "dynamics" && metadata?.pendingInstanceSelection === true,
          instanceName:
            item.type === "dynamics" && typeof metadata?.instanceName === "string"
              ? metadata.instanceName
              : null,
          instanceUrl:
            item.type === "dynamics" && typeof metadata?.instanceUrl === "string"
              ? metadata.instanceUrl
              : null,
          authStatus: item.authStatus,
          authErrorCode: item.authErrorCode ?? null,
          scopes: item.scopes ?? null,
          createdAt: item.createdAt.toISOString(),
        };
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
