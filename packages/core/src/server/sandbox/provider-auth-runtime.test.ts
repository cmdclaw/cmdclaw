import { beforeEach, describe, expect, it, vi } from "vitest";
import { toRuntimeProviderAuthPayload } from "./provider-auth-runtime";

describe("provider auth runtime payload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-13T10:00:00.000Z").getTime());
  });

  it("keeps OpenAI refresh host-managed when injecting runtime auth", () => {
    const payload = toRuntimeProviderAuthPayload({
      provider: "openai",
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresAt: new Date("2026-04-13T11:00:00.000Z").getTime(),
      authSource: "shared",
    });

    expect(payload).toEqual({
      providerID: "openai",
      auth: {
        type: "oauth",
        access: "fresh-access",
        refresh: "",
        expires: new Date("2026-04-20T10:00:00.000Z").getTime(),
      },
    });
  });

  it("maps Kimi auth to the runtime API-key provider", () => {
    const payload = toRuntimeProviderAuthPayload({
      provider: "kimi",
      accessToken: "kimi-key",
      refreshToken: null,
      expiresAt: null,
      authSource: "user",
    });

    expect(payload).toEqual({
      providerID: "kimi-for-coding",
      auth: {
        type: "api",
        key: "kimi-key",
      },
    });
  });

  it("maps Google auth to the runtime API-key provider", () => {
    const payload = toRuntimeProviderAuthPayload({
      provider: "google",
      accessToken: "gemini-key",
      refreshToken: null,
      expiresAt: null,
      authSource: "shared",
    });

    expect(payload).toEqual({
      providerID: "google",
      auth: {
        type: "api",
        key: "gemini-key",
      },
    });
  });
});
