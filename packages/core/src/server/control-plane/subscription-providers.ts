import { and, eq } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { providerAuth } from "@cmdclaw/db/schema";
import { isSelfHostedEdition } from "../edition";
import { getCloudManagedProviderAuthStatus } from "./client";

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

export async function hasConnectedProviderAuthForUser(userId: string, provider: string) {
  if (isSelfHostedEdition()) {
    const status = await getCloudManagedProviderAuthStatus(userId);
    return status.connected.includes(provider);
  }

  const auth = await db.query.providerAuth.findFirst({
    where: and(eq(providerAuth.userId, userId), eq(providerAuth.provider, provider)),
    columns: { id: true },
  });

  return Boolean(auth);
}
