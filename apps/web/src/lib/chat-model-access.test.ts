import { describe, expect, it } from "vitest";
import { isModelAccessibleForNewChat } from "./chat-model-access";

describe("isModelAccessibleForNewChat", () => {
  it("returns true for anthropic models without any connected provider auth", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "anthropic/claude-sonnet-4-6",
        hasUserOpenAI: false,
        hasSharedOpenAI: false,
      }),
    ).toBe(true);
  });

  it("returns false for openai models when ChatGPT is disconnected", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "openai/gpt-5.4",
        hasUserOpenAI: false,
        hasSharedOpenAI: false,
      }),
    ).toBe(false);
  });

  it("returns true for openai models when the personal ChatGPT source is connected", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "openai/gpt-5.4",
        authSource: "user",
        hasUserOpenAI: true,
        hasSharedOpenAI: false,
      }),
    ).toBe(true);
  });

  it("returns true for openai models when the shared ChatGPT source is connected", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "openai/gpt-5.4",
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

  it("returns false for opencode models while they are hidden from the selector", () => {
    expect(
      isModelAccessibleForNewChat({
        model: "opencode/glm-5-free",
        hasUserOpenAI: false,
        hasSharedOpenAI: false,
      }),
    ).toBe(false);
  });
});
