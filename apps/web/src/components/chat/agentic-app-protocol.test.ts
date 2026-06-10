import { describe, expect, it } from "vitest";
import {
  AGENTIC_APP_PROMPT_RESULT_TYPE,
  AGENTIC_APP_PROMPT_TYPE,
  AGENTIC_APP_PROMPT_VERSION,
  buildAgenticAppPromptResult,
  parseAgenticAppPromptMessage,
} from "./agentic-app-protocol";

describe("parseAgenticAppPromptMessage", () => {
  it("accepts a valid version 1 envelope", () => {
    const result = parseAgenticAppPromptMessage({
      type: AGENTIC_APP_PROMPT_TYPE,
      version: 1,
      prompt: "Send the weekly email",
    });
    expect(result).toEqual({ kind: "prompt", prompt: "Send the weekly email" });
  });

  it("tolerates unknown extra fields", () => {
    const result = parseAgenticAppPromptMessage({
      type: AGENTIC_APP_PROMPT_TYPE,
      version: 1,
      prompt: "hi",
      future: { nested: true },
      label: "ignored",
    });
    expect(result).toEqual({ kind: "prompt", prompt: "hi" });
  });

  it("silently ignores unknown types", () => {
    expect(parseAgenticAppPromptMessage({ type: "other:thing", version: 1, prompt: "hi" })).toEqual(
      { kind: "ignored" },
    );
  });

  it("silently ignores unknown versions", () => {
    expect(
      parseAgenticAppPromptMessage({ type: AGENTIC_APP_PROMPT_TYPE, version: 2, prompt: "hi" }),
    ).toEqual({ kind: "ignored" });
    expect(
      parseAgenticAppPromptMessage({ type: AGENTIC_APP_PROMPT_TYPE, version: "1", prompt: "hi" }),
    ).toEqual({ kind: "ignored" });
  });

  it("silently ignores non-object data", () => {
    expect(parseAgenticAppPromptMessage(null)).toEqual({ kind: "ignored" });
    expect(parseAgenticAppPromptMessage(undefined)).toEqual({ kind: "ignored" });
    expect(parseAgenticAppPromptMessage("hello")).toEqual({ kind: "ignored" });
    expect(parseAgenticAppPromptMessage(42)).toEqual({ kind: "ignored" });
    expect(parseAgenticAppPromptMessage(["array"])).toEqual({ kind: "ignored" });
  });

  it("rejects a version 1 envelope with a malformed prompt as invalid", () => {
    expect(parseAgenticAppPromptMessage({ type: AGENTIC_APP_PROMPT_TYPE, version: 1 })).toEqual({
      kind: "invalid",
    });
    expect(
      parseAgenticAppPromptMessage({ type: AGENTIC_APP_PROMPT_TYPE, version: 1, prompt: 42 }),
    ).toEqual({ kind: "invalid" });
    expect(
      parseAgenticAppPromptMessage({ type: AGENTIC_APP_PROMPT_TYPE, version: 1, prompt: "   " }),
    ).toEqual({ kind: "invalid" });
  });
});

describe("buildAgenticAppPromptResult", () => {
  it("builds a sent ack without a reason field", () => {
    expect(buildAgenticAppPromptResult("sent")).toEqual({
      type: AGENTIC_APP_PROMPT_RESULT_TYPE,
      version: AGENTIC_APP_PROMPT_VERSION,
      status: "sent",
    });
  });

  it("builds a rejected ack with a reason", () => {
    expect(buildAgenticAppPromptResult("rejected", "rate_limited")).toEqual({
      type: AGENTIC_APP_PROMPT_RESULT_TYPE,
      version: AGENTIC_APP_PROMPT_VERSION,
      status: "rejected",
      reason: "rate_limited",
    });
  });

  it("builds a rejected ack without a reason", () => {
    expect(buildAgenticAppPromptResult("rejected")).toEqual({
      type: AGENTIC_APP_PROMPT_RESULT_TYPE,
      version: AGENTIC_APP_PROMPT_VERSION,
      status: "rejected",
    });
  });
});
