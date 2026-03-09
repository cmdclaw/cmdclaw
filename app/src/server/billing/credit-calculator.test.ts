import { describe, expect, it } from "vitest";
import { calculateCredits } from "./credit-calculator";

describe("calculateCredits", () => {
  it("charges different amounts for different models with the same usage", () => {
    const cheap = calculateCredits({
      model: "openai/gpt-4.1-mini",
      inputTokens: 2000,
      outputTokens: 1000,
      sandboxRuntimeMs: 0,
    });
    const expensive = calculateCredits({
      model: "anthropic/claude-opus-4-1",
      inputTokens: 2000,
      outputTokens: 1000,
      sandboxRuntimeMs: 0,
    });

    expect(expensive.credits).toBeGreaterThan(cheap.credits);
  });

  it("adds sandbox runtime to the total credit spend", () => {
    const withoutRuntime = calculateCredits({
      model: "anthropic/claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 1000,
      sandboxRuntimeMs: 0,
    });
    const withRuntime = calculateCredits({
      model: "anthropic/claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 1000,
      sandboxRuntimeMs: 120_000,
    });

    expect(withRuntime.credits).toBeGreaterThan(withoutRuntime.credits);
    expect(withRuntime.sandboxCredits).toBeGreaterThan(0);
  });

  it("rounds up fractional spend consistently", () => {
    const result = calculateCredits({
      model: "google/gemini-2.5-flash",
      inputTokens: 1,
      outputTokens: 1,
      sandboxRuntimeMs: 1,
    });

    expect(result.credits).toBe(1);
  });
});
