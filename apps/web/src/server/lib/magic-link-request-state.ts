import { db } from "@cmdclaw/db/client";
import { magicLinkRequestState } from "@cmdclaw/db/schema";
import { eq, lt } from "drizzle-orm";
import { extractMagicLinkRedirectState, hashMagicLinkToken } from "@/lib/magic-link-request";

export const MAGIC_LINK_REQUEST_TTL_MS = 60 * 60 * 1000;

export type StoredMagicLinkRequestState = {
  tokenHash: string;
  email: string;
  callbackUrl: string | null;
  newUserCallbackUrl: string | null;
  errorCallbackUrl: string | null;
  expiresAt: Date;
  createdAt: Date;
};

export async function createMagicLinkRequestState(params: {
  token: string;
  email: string;
  verificationUrl: string;
}) {
  const cutoff = new Date();
  await db.delete(magicLinkRequestState).where(lt(magicLinkRequestState.expiresAt, cutoff));

  const redirectState = extractMagicLinkRedirectState(params.verificationUrl);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_REQUEST_TTL_MS);

  await db
    .insert(magicLinkRequestState)
    .values({
      tokenHash: hashMagicLinkToken(params.token),
      email: params.email,
      callbackUrl: redirectState.callbackURL ?? null,
      newUserCallbackUrl: redirectState.newUserCallbackURL ?? null,
      errorCallbackUrl: redirectState.errorCallbackURL ?? null,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: magicLinkRequestState.tokenHash,
      set: {
        email: params.email,
        callbackUrl: redirectState.callbackURL ?? null,
        newUserCallbackUrl: redirectState.newUserCallbackURL ?? null,
        errorCallbackUrl: redirectState.errorCallbackURL ?? null,
        expiresAt,
        createdAt: new Date(),
      },
    });

  return {
    tokenHash: hashMagicLinkToken(params.token),
    email: params.email,
    callbackUrl: redirectState.callbackURL ?? null,
    newUserCallbackUrl: redirectState.newUserCallbackURL ?? null,
    errorCallbackUrl: redirectState.errorCallbackURL ?? null,
    expiresAt,
  };
}

export async function getMagicLinkRequestState(
  token: string,
): Promise<StoredMagicLinkRequestState | null> {
  const row = await db.query.magicLinkRequestState.findFirst({
    where: eq(magicLinkRequestState.tokenHash, hashMagicLinkToken(token)),
  });

  if (!row) {
    return null;
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return row;
}
