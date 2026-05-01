import { describe, expect, it } from "vitest";
import { formatOAuthConnectionError } from "./oauth-error-message";

describe("formatOAuthConnectionError", () => {
  it("explains Salesforce External Client App lookup failures", () => {
    expect(formatOAuthConnectionError("OAUTH EC APP NOT FOUND")).toBe(
      "Salesforce could not find this OAuth app in the target org. Install or package the External Client App for that org, then try again.",
    );
  });

  it("formats known internal OAuth error codes", () => {
    expect(formatOAuthConnectionError("token_exchange_failed")).toBe(
      "OAuth token exchange failed. Check the client id, secret, and callback URL.",
    );
  });

  it("falls back to the original provider error", () => {
    expect(formatOAuthConnectionError("unknown_provider_error")).toBe(
      "Failed to connect: unknown_provider_error",
    );
  });
});
