import { describe, expect, it } from "vitest";
import {
  normalizeModelAuthSource,
  resolveDefaultProviderAuthSourceForAvailability,
  resolveProviderAuthAvailability,
} from "./provider-auth-source";

describe("provider-auth-source", () => {
  it("defaults openai models to shared", () => {
    expect(
      normalizeModelAuthSource({
        model: "openai/gpt-5.4",
      }),
    ).toBe("shared");
  });

  it("defaults anthropic models to shared", () => {
    expect(
      normalizeModelAuthSource({
        model: "anthropic/claude-sonnet-4-6",
      }),
    ).toBe("shared");
  });

  it("keeps kimi models on user auth", () => {
    expect(
      normalizeModelAuthSource({
        model: "kimi-for-coding/k2p5",
      }),
    ).toBe("user");
  });

  it("defaults google models to shared", () => {
    expect(
      normalizeModelAuthSource({
        model: "google/gemini-3.1-pro-preview",
      }),
    ).toBe("shared");
  });

  it("requires explicit shared availability for anthropic models", () => {
    expect(
      resolveProviderAuthAvailability({
        providerID: "anthropic",
        connectedProviderIds: [],
        sharedConnectedProviderIds: [],
      }),
    ).toEqual({
      user: false,
      shared: false,
    });
  });

  it("resolves anthropic shared availability when the shared source is advertised", () => {
    expect(
      resolveProviderAuthAvailability({
        providerID: "anthropic",
        connectedProviderIds: [],
        sharedConnectedProviderIds: ["anthropic"],
      }),
    ).toEqual({
      user: false,
      shared: true,
    });
  });

  it("resolves google shared availability when the shared source is advertised", () => {
    expect(
      resolveProviderAuthAvailability({
        providerID: "google",
        connectedProviderIds: [],
        sharedConnectedProviderIds: ["google"],
      }),
    ).toEqual({
      user: false,
      shared: true,
    });
  });

  it("prefers shared when both sources are available", () => {
    expect(
      resolveDefaultProviderAuthSourceForAvailability({
        providerID: "openai",
        availability: {
          user: true,
          shared: true,
        },
      }),
    ).toBe("shared");
  });

  it("falls back to user when shared is unavailable", () => {
    expect(
      resolveDefaultProviderAuthSourceForAvailability({
        providerID: "openai",
        availability: {
          user: true,
          shared: false,
        },
      }),
    ).toBe("user");
  });
});
