import { and, eq } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { providerAuth, sharedProviderAuth } from "@cmdclaw/db/schema";
import type { ProviderAuthSource } from "../../lib/provider-auth-source";
import { decrypt } from "../utils/encryption";
import { isSelfHostedEdition } from "../edition";
import { getCloudManagedProviderAuthStatus, getDelegatedProviderAuths } from "./client";

export type ResolvedProviderAuth = {
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  authSource: ProviderAuthSource;
};

export async function getConnectedProviderAuthIdsForUser(userId: string): Promise<string[]> {
  if (isSelfHostedEdition()) {
    const status = await getCloudManagedProviderAuthStatus(userId);
    return status.connected;
  }

  const auths = await db.query.providerAuth.findMany({
    where: eq(providerAuth.userId, userId),
    columns: {
      provider: true,
    },
  });

  return auths.map((auth) => auth.provider);
}

export async function getSharedConnectedProviderAuthIds(): Promise<string[]> {
  if (isSelfHostedEdition()) {
    return [];
  }

  const auths = await db.query.sharedProviderAuth.findMany({
    columns: { provider: true },
  });

  return auths.map((auth) => auth.provider);
}

export async function getProviderAuthAvailabilityForUser(userId: string): Promise<{
  connected: string[];
  shared: string[];
}> {
  const [connected, shared] = await Promise.all([
    getConnectedProviderAuthIdsForUser(userId),
    getSharedConnectedProviderAuthIds(),
  ]);

  return { connected, shared };
}

async function getUserProviderAuth(
  userId: string,
  provider: string,
): Promise<ResolvedProviderAuth | null> {
  if (isSelfHostedEdition()) {
    const delegated = await getDelegatedProviderAuths(userId);
    const auth = delegated.find((entry) => entry.provider === provider);
    if (!auth) {
      return null;
    }

    return {
      provider: auth.provider,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken ?? null,
      expiresAt: auth.expiresAt ?? null,
      authSource: "user",
    };
  }

  const auth = await db.query.providerAuth.findFirst({
    where: and(eq(providerAuth.userId, userId), eq(providerAuth.provider, provider)),
  });

  if (!auth) {
    return null;
  }

  try {
    return {
      provider: auth.provider,
      accessToken: decrypt(auth.accessToken),
      refreshToken: auth.refreshToken ? decrypt(auth.refreshToken) : null,
      expiresAt: auth.expiresAt?.getTime() ?? null,
      authSource: "user",
    };
  } catch {
    return null;
  }
}

async function getSharedProviderAuth(provider: string): Promise<ResolvedProviderAuth | null> {
  if (isSelfHostedEdition()) {
    return null;
  }

  const auth = await db.query.sharedProviderAuth.findFirst({
    where: eq(sharedProviderAuth.provider, provider),
  });

  if (!auth) {
    return null;
  }

  try {
    return {
      provider: auth.provider,
      accessToken: decrypt(auth.accessToken),
      refreshToken: auth.refreshToken ? decrypt(auth.refreshToken) : null,
      expiresAt: auth.expiresAt?.getTime() ?? null,
      authSource: "shared",
    };
  } catch {
    return null;
  }
}

export async function getResolvedProviderAuth(params: {
  userId: string;
  provider: string;
  authSource?: ProviderAuthSource | null;
}): Promise<ResolvedProviderAuth | null> {
  if (params.authSource === "shared") {
    return getSharedProviderAuth(params.provider);
  }

  if (params.authSource === "user") {
    return getUserProviderAuth(params.userId, params.provider);
  }

  return (
    (await getUserProviderAuth(params.userId, params.provider)) ??
    (await getSharedProviderAuth(params.provider))
  );
}

export async function hasConnectedProviderAuthForUser(
  userId: string,
  provider: string,
  authSource?: ProviderAuthSource | null,
) {
  const auth = await getResolvedProviderAuth({ userId, provider, authSource });
  return Boolean(auth);
}
