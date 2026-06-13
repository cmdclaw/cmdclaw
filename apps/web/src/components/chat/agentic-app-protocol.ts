export const AGENTIC_APP_PROMPT_TYPE = "bap:agentic-app-prompt";
export const AGENTIC_APP_PROMPT_RESULT_TYPE = "bap:agentic-app-prompt-result";
export const AGENTIC_APP_PROMPT_VERSION = 1;

export type AgenticAppPromptRejectionReason = "rate_limited" | "no_user_activation" | "invalid";

export type AgenticAppPromptResult = {
  type: typeof AGENTIC_APP_PROMPT_RESULT_TYPE;
  version: typeof AGENTIC_APP_PROMPT_VERSION;
  status: "sent" | "rejected";
  reason?: AgenticAppPromptRejectionReason;
};

export type ParsedAgenticAppPromptMessage =
  | { kind: "prompt"; prompt: string }
  | { kind: "invalid" }
  | { kind: "ignored" };

// The envelope is a frozen public contract (ADR 0014): stored Agentic-Apps keep
// posting the shape they were generated with, so version 1 must parse forever and
// unknown types/versions must stay silently ignored rather than rejected.
export function parseAgenticAppPromptMessage(data: unknown): ParsedAgenticAppPromptMessage {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { kind: "ignored" };
  }

  const record = data as Record<string, unknown>;
  if (record.type !== AGENTIC_APP_PROMPT_TYPE || record.version !== AGENTIC_APP_PROMPT_VERSION) {
    return { kind: "ignored" };
  }

  if (typeof record.prompt !== "string" || record.prompt.trim().length === 0) {
    return { kind: "invalid" };
  }

  return { kind: "prompt", prompt: record.prompt };
}

export function buildAgenticAppPromptResult(
  status: "sent" | "rejected",
  reason?: AgenticAppPromptRejectionReason,
): AgenticAppPromptResult {
  return {
    type: AGENTIC_APP_PROMPT_RESULT_TYPE,
    version: AGENTIC_APP_PROMPT_VERSION,
    status,
    ...(reason ? { reason } : {}),
  };
}
