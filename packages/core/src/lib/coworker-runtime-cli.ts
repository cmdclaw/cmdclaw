export const COWORKER_INVOCATION_ENVELOPE_KIND = "coworker_invocation" as const;

export type CoworkerRuntimeRunStatus =
  | "running"
  | "awaiting_approval"
  | "awaiting_auth"
  | "completed"
  | "error"
  | "cancelled";

export type CoworkerInvocationEnvelope = {
  kind: typeof COWORKER_INVOCATION_ENVELOPE_KIND;
  coworkerId: string;
  username: string;
  name: string;
  runId: string;
  conversationId: string;
  generationId: string;
  status: CoworkerRuntimeRunStatus;
  attachmentNames: string[];
  message: string;
};

const JSON_FLAG = "--json";

function extractJsonCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.startsWith("{") && line.endsWith("}")) {
      return line;
    }
  }

  return null;
}

function looksLikeCoworkerInvokeCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  return /^coworker\s+invoke(?:\s|$)/.test(normalized) || /\/coworker\s+invoke(?:\s|$)/.test(normalized);
}

function parseEnvelopeObject(value: unknown): CoworkerInvocationEnvelope | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== COWORKER_INVOCATION_ENVELOPE_KIND) {
    return null;
  }

  if (
    typeof candidate.coworkerId !== "string" ||
    typeof candidate.username !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.runId !== "string" ||
    typeof candidate.conversationId !== "string" ||
    typeof candidate.generationId !== "string" ||
    typeof candidate.status !== "string" ||
    typeof candidate.message !== "string"
  ) {
    return null;
  }

  const attachmentNames = Array.isArray(candidate.attachmentNames)
    ? candidate.attachmentNames.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    kind: COWORKER_INVOCATION_ENVELOPE_KIND,
    coworkerId: candidate.coworkerId,
    username: candidate.username,
    name: candidate.name,
    runId: candidate.runId,
    conversationId: candidate.conversationId,
    generationId: candidate.generationId,
    status: candidate.status as CoworkerRuntimeRunStatus,
    attachmentNames,
    message: candidate.message,
  };
}

export function parseCoworkerInvocationEnvelope(params: {
  toolName: string;
  toolInput: unknown;
  toolResult: unknown;
}): CoworkerInvocationEnvelope | null {
  if (params.toolName !== "Bash") {
    return null;
  }

  if (!params.toolInput || typeof params.toolInput !== "object") {
    return null;
  }

  const command = (params.toolInput as { command?: unknown }).command;
  if (typeof command !== "string" || !looksLikeCoworkerInvokeCommand(command)) {
    return null;
  }

  if (!command.includes(JSON_FLAG)) {
    return null;
  }

  if (typeof params.toolResult === "string") {
    const candidate = extractJsonCandidate(params.toolResult);
    if (!candidate) {
      return null;
    }

    try {
      return parseEnvelopeObject(JSON.parse(candidate));
    } catch {
      return null;
    }
  }

  if (params.toolResult && typeof params.toolResult === "object") {
    const record = params.toolResult as Record<string, unknown>;
    if (typeof record.stdout === "string") {
      const candidate = extractJsonCandidate(record.stdout);
      if (candidate) {
        try {
          return parseEnvelopeObject(JSON.parse(candidate));
        } catch {
          return null;
        }
      }
    }
    return parseEnvelopeObject(record);
  }

  return null;
}

export function getCoworkerCliSystemPrompt(): string {
  return [
    "## Coworker Invocation",
    "When the user explicitly mentions one or more coworker handles such as @sales-digest, treat that as a request to delegate work to those coworkers.",
    "Before invoking any coworker, run `coworker list --json` to inspect the currently available coworkers and verify the exact usernames.",
    "To launch a coworker, use `coworker invoke --username <username> --message <explicit task> --json`.",
    "If the user uploaded relevant files, forward them with repeated `--attachment <sandbox-path>` arguments.",
    "Do not guess coworker usernames. If a mention cannot be resolved exactly, explain the mismatch and stop.",
    "When multiple coworker mentions are present, invoke each coworker separately.",
    "Always use `--json` for `coworker invoke` so CmdClaw can render a coworker invocation card in chat.",
  ].join("\n");
}
