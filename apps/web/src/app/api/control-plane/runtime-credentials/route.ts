import { getResolvedProviderAuth } from "@cmdclaw/core/server/control-plane/subscription-providers";
import {
  getCliEnvForUser,
  getEnabledIntegrationTypes,
  getTokensForIntegrations,
} from "@cmdclaw/core/server/integrations/cli-env";
import {
  ConnectedAccountResolutionError,
  resolveConnectedAccountCredential,
} from "@cmdclaw/core/server/integrations/connected-account-resolution";
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
      resolve?: {
        integrationType?: string;
        accountLabel?: string | null;
        allowedIntegrationTypes?: string[];
      };
    };
    if (!body.cloudUserId) {
      return NextResponse.json({ message: "Missing cloudUserId" }, { status: 400 });
    }

    const auths = await db.query.providerAuth.findMany({
      where: eq(providerAuth.userId, body.cloudUserId),
      columns: {
        provider: true,
      },
    });
    const resolvedProviderAuths = (
      await Promise.all(
        auths.map((auth) =>
          getResolvedProviderAuth({
            userId: body.cloudUserId!,
            provider: auth.provider,
            authSource: "user",
          }),
        ),
      )
    ).filter((auth): auth is NonNullable<typeof auth> => Boolean(auth));

    if (body.resolve?.integrationType) {
      try {
        const credential = await resolveConnectedAccountCredential({
          userId: body.cloudUserId,
          integrationType: body.resolve.integrationType as never,
          accountLabel: body.resolve.accountLabel,
          allowedIntegrationTypes: body.resolve.allowedIntegrationTypes as never,
        });
        return NextResponse.json({
          credential,
          issuedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (error instanceof ConnectedAccountResolutionError) {
          return NextResponse.json(
            {
              code: error.code,
              message: error.message,
              availableAccountLabels: error.availableAccountLabels,
            },
            { status: 409 },
          );
        }
        throw error;
      }
    }

    return NextResponse.json({
      cliEnv: await getCliEnvForUser(body.cloudUserId),
      tokens: await getTokensForIntegrations(body.cloudUserId, body.integrationTypes ?? []),
      enabledIntegrations: await getEnabledIntegrationTypes(body.cloudUserId),
      connectedProviders: resolvedProviderAuths.map((auth) => auth.provider),
      providerAuths: resolvedProviderAuths.map((auth) => ({
        provider: auth.provider,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        expiresAt: auth.expiresAt,
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
