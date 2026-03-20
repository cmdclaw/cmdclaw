import { describe, expect, it } from "vitest";
import { isModelAccessibleForNewChat } from "./chat-model-access";

describe("isModelAccessibleForNewChat", () => {
  it("returns false for openai models when ChatGPT is disconnected", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "openai/gpt-5.2-codex",
        hasUserOpenAI: false,
        hasSharedOpenAI: false,
      }),
    ).toBe(false);
  });

  it("returns true for openai models when the personal ChatGPT source is connected", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "openai/gpt-5.2-codex",
        authSource: "user",
        hasUserOpenAI: true,
        hasSharedOpenAI: false,
      }),
    ).toBe(true);
  });

  it("returns true for openai models when the shared ChatGPT source is connected", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "openai/gpt-5.2-codex",
        authSource: "shared",
        hasUserOpenAI: false,
        hasSharedOpenAI: true,
      }),
    ).toBe(true);
  });

  it("returns false for unknown openai model IDs", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "openai/unknown",
        authSource: "user",
        hasUserOpenAI: true,
        hasSharedOpenAI: false,
      }),
    ).toBe(false);
  });

  it("validates opencode models against fetched model list when available", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "opencode/glm-5-free",
        hasUserOpenAI: false,
        hasSharedOpenAI: false,
        availableOpencodeFreeModelIDs: ["opencode/grok-code-fast-1"],
      }),
    ).toBe(false);
  });
});
