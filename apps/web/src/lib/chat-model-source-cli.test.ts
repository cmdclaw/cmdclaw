import { describe, expect, it } from "vitest";
import {
  parseInteractiveModelCommand,
  resolveCliModelSelection,
} from "../../scripts/lib/chat-model-source";

describe("chat-model-source CLI helpers", () => {
  it("defaults openai selections to shared when both sources are available", () => {
    expect(
      resolveCliModelSelection({
        model: "openai/gpt-5.4",
        connectedProviderIds: ["openai"],
        sharedConnectedProviderIds: ["openai"],
      }),
    ).toEqual({
      model: "openai/gpt-5.4",
      authSource: "shared",
    });
  });

  it("falls back to user when shared is unavailable", () => {
    expect(
      resolveCliModelSelection({
        model: "openai/gpt-5.4",
        connectedProviderIds: ["openai"],
        sharedConnectedProviderIds: [],
      }),
    ).toEqual({
      model: "openai/gpt-5.4",
      authSource: "user",
    });
  });

  it("honors explicit user override", () => {
    expect(
      resolveCliModelSelection({
        model: "openai/gpt-5.4",
        authSource: "user",
        connectedProviderIds: ["openai"],
        sharedConnectedProviderIds: ["openai"],
      }),
    ).toEqual({
      model: "openai/gpt-5.4",
      authSource: "user",
    });
  });

  it("rejects unsupported sources for shared-only providers", () => {
    expect(() =>
      resolveCliModelSelection({
        model: "anthropic/claude-sonnet-4-6",
        authSource: "user",
      }),
    ).toThrow('Model provider "anthropic" does not support --auth-source user.');
  });

  it("parses interactive model commands with auth-source", () => {
    expect(parseInteractiveModelCommand("openai/gpt-5.4 --auth-source user")).toEqual({
      model: "openai/gpt-5.4",
      authSource: "user",
    });
  });
});
