import {
  getCliEnvForUser,
  getEnabledIntegrationTypes,
  getTokensForIntegrations,
} from "@cmdclaw/core/server/integrations/cli-env";
import { decrypt } from "@cmdclaw/core/server/utils/encryption";
import { db } from "@cmdclaw/db/client";
import { providerAuth } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertValidInstanceApiKey } from "@/server/control-plane/auth";

export async function POST(request: Request) {
  try {
    assertValidInstanceApiKey(request);
    const body = (await request.json()) as {
      cloudUserId?: string;
      integrationTypes?: string[];
    };
    if (!body.cloudUserId) {
      return NextResponse.json({ message: "Missing cloudUserId" }, { status: 400 });
    }

    const auths = await db.query.providerAuth.findMany({
      where: eq(providerAuth.userId, body.cloudUserId),
      columns: {
        provider: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({
      cliEnv: await getCliEnvForUser(body.cloudUserId),
      tokens: await getTokensForIntegrations(body.cloudUserId, body.integrationTypes ?? []),
      enabledIntegrations: await getEnabledIntegrationTypes(body.cloudUserId),
      connectedProviders: auths.map((auth) => auth.provider),
      providerAuths: auths.map((auth) => ({
        provider: auth.provider,
        accessToken: decrypt(auth.accessToken),
        refreshToken: auth.refreshToken ? decrypt(auth.refreshToken) : null,
        expiresAt: auth.expiresAt?.getTime() ?? null,
      })),
      issuedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
