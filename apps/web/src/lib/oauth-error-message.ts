const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Access was denied before the connection finished.",
  callback_failed: "OAuth callback failed. Check the app configuration and try again.",
  invalid_source: "This OAuth source no longer exists or is no longer configured for OAuth.",
  missing_params: "OAuth callback was missing required information.",
  no_access_token: "OAuth completed, but no access token was returned.",
  token_exchange_failed:
    "OAuth token exchange failed. Check the client id, secret, and callback URL.",
  user_mismatch: "OAuth was completed by a different signed-in user.",
};

export function formatOAuthConnectionError(error: string | null | undefined): string {
  const trimmedError = error?.trim();
  if (!trimmedError) {
    return "OAuth connection failed.";
  }

  const normalizedCode = trimmedError.toLowerCase().replace(/\s+/g, "_");
  if (normalizedCode === "oauth_ec_app_not_found") {
    return [
      "Salesforce could not find this OAuth app in the target org.",
      "Install or package the External Client App for that org, then try again.",
    ].join(" ");
  }

  return OAUTH_ERROR_MESSAGES[normalizedCode] ?? `Failed to connect: ${trimmedError}`;
}
