import crypto from "crypto";

export type MagicLinkRedirectState = {
  callbackURL?: string;
  newUserCallbackURL?: string;
  errorCallbackURL?: string;
};

function normalizeState(state: MagicLinkRedirectState): MagicLinkRedirectState {
  return {
    ...(state.callbackURL ? { callbackURL: state.callbackURL } : {}),
    ...(state.newUserCallbackURL ? { newUserCallbackURL: state.newUserCallbackURL } : {}),
    ...(state.errorCallbackURL ? { errorCallbackURL: state.errorCallbackURL } : {}),
  };
}

export function extractMagicLinkRedirectState(verificationUrl: string): MagicLinkRedirectState {
  const parsedUrl = new URL(verificationUrl);

  return normalizeState({
    callbackURL: parsedUrl.searchParams.get("callbackURL") ?? undefined,
    newUserCallbackURL: parsedUrl.searchParams.get("newUserCallbackURL") ?? undefined,
    errorCallbackURL: parsedUrl.searchParams.get("errorCallbackURL") ?? undefined,
  });
}

export function buildSignInMagicLinkUrl({
  token,
  baseUrl,
}: {
  token: string;
  baseUrl: string;
}): string {
  return new URL(`/sign-in/${encodeURIComponent(token)}`, baseUrl).toString();
}

export function hashMagicLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
