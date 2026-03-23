import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cmdclaw/core/server/ai/subscription-providers", () => ({
  SUBSCRIPTION_PROVIDERS: {},
  isOAuthProviderConfig: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/server/ai/pending-oauth", () => ({
  consumePending: vi.fn(),
}));

vi.mock("@/server/orpc/routers/provider-auth", () => ({
  storeProviderTokens: vi.fn(),
}));

import { GET } from "./route";

function getLocation(response: Response) {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Expected redirect location");
  }
  return location;
}

describe("GET /api/auth/provider/[provider]/callback", () => {
  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("uses APP_URL for provider callback redirects when the request host is internal", async () => {
    process.env.APP_URL = "https://app.example.com";

    const response = await GET(
      new NextRequest("https://0.0.0.0:8080/api/auth/provider/openai/callback?error=access_denied"),
      {
        params: Promise.resolve({ provider: "openai" }),
      },
    );

    expect(response.status).toBe(307);
    expect(getLocation(response)).toBe(
      "https://app.example.com/settings/subscriptions?provider_error=access_denied",
    );
  });
});
