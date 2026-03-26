export const COWORKER_INVOCATION_ENVELOPE_KIND = "coworker_invocation" as const;
export const COWORKER_PATCH_APPLY_ENVELOPE_KIND = "coworker_patch_apply" as const;

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

export type CoworkerPatchApplyEnvelopeCoworker = {
  coworkerId: string;
  updatedAt: string;
  prompt: string;
  model: string;
  toolAccessMode: "all" | "selected";
  triggerType: string;
  schedule: unknown;
  allowedIntegrations: string[];
};

export type CoworkerPatchApplyEnvelope =
  | {
      kind: typeof COWORKER_PATCH_APPLY_ENVELOPE_KIND;
      status: "applied";
      coworkerId: string;
      appliedChanges: string[];
      coworker: CoworkerPatchApplyEnvelopeCoworker;
      message: string;
      details?: string[] | undefined;
    }
  | {
      kind: typeof COWORKER_PATCH_APPLY_ENVELOPE_KIND;
      status: "conflict";
      coworkerId: string;
      appliedChanges?: string[] | undefined;
      coworker: CoworkerPatchApplyEnvelopeCoworker;
      message: string;
      details?: string[] | undefined;
    }
  | {
      kind: typeof COWORKER_PATCH_APPLY_ENVELOPE_KIND;
      status: "validation_error";
      coworkerId: string;
      appliedChanges?: string[] | undefined;
      coworker?: CoworkerPatchApplyEnvelopeCoworker | undefined;
      message: string;
      details: string[];
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

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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

  return (
    /^coworker\s+invoke(?:\s|$)/.test(normalized) || /\/coworker\s+invoke(?:\s|$)/.test(normalized)
  );
}

function looksLikeCoworkerPatchCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  return (
    /^coworker\s+patch(?:\s|$)/.test(normalized) || /\/coworker\s+patch(?:\s|$)/.test(normalized)
  );
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

function parsePatchCoworker(value: unknown): CoworkerPatchApplyEnvelopeCoworker | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.coworkerId !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.prompt !== "string" ||
    typeof candidate.model !== "string" ||
    (candidate.toolAccessMode !== "all" && candidate.toolAccessMode !== "selected") ||
    typeof candidate.triggerType !== "string" ||
    !Array.isArray(candidate.allowedIntegrations)
  ) {
    return null;
  }

  const allowedIntegrations = candidate.allowedIntegrations.filter(
    (entry): entry is string => typeof entry === "string",
  );

  return {
    coworkerId: candidate.coworkerId,
    updatedAt: candidate.updatedAt,
    prompt: candidate.prompt,
    model: candidate.model,
    toolAccessMode: candidate.toolAccessMode,
    triggerType: candidate.triggerType,
    schedule: candidate.schedule ?? null,
    allowedIntegrations,
  };
}

function parsePatchEnvelopeObject(value: unknown): CoworkerPatchApplyEnvelope | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== COWORKER_PATCH_APPLY_ENVELOPE_KIND) {
    return null;
  }

  if (
    candidate.status !== "applied" &&
    candidate.status !== "conflict" &&
    candidate.status !== "validation_error"
  ) {
    return null;
  }

  if (typeof candidate.coworkerId !== "string" || typeof candidate.message !== "string") {
    return null;
  }

  const appliedChanges = Array.isArray(candidate.appliedChanges)
    ? candidate.appliedChanges.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const details = Array.isArray(candidate.details)
    ? candidate.details.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const coworker = parsePatchCoworker(candidate.coworker);

  if (candidate.status === "applied") {
    if (!coworker) {
      return null;
    }
    return {
      kind: COWORKER_PATCH_APPLY_ENVELOPE_KIND,
      status: "applied",
      coworkerId: candidate.coworkerId,
      appliedChanges: appliedChanges ?? [],
      coworker,
      message: candidate.message,
      details,
    };
  }

  if (candidate.status === "conflict") {
    if (!coworker) {
      return null;
    }
    return {
      kind: COWORKER_PATCH_APPLY_ENVELOPE_KIND,
      status: "conflict",
      coworkerId: candidate.coworkerId,
      appliedChanges,
      coworker,
      message: candidate.message,
      details,
    };
  }

  if (!details) {
    return null;
  }

  return {
    kind: COWORKER_PATCH_APPLY_ENVELOPE_KIND,
    status: "validation_error",
    coworkerId: candidate.coworkerId,
    appliedChanges,
    coworker: coworker ?? undefined,
    message: candidate.message,
    details,
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

export function parseCoworkerPatchApplyEnvelope(params: {
  toolName: string;
  toolInput: unknown;
  toolResult: unknown;
}): CoworkerPatchApplyEnvelope | null {
  if (params.toolName !== "Bash") {
    return null;
  }

  if (!params.toolInput || typeof params.toolInput !== "object") {
    return null;
  }

  const command = (params.toolInput as { command?: unknown }).command;
  if (typeof command !== "string" || !looksLikeCoworkerPatchCommand(command)) {
    return null;
  }

  if (typeof params.toolResult === "string") {
    const candidate = extractJsonCandidate(params.toolResult);
    if (!candidate) {
      return null;
    }

    try {
      return parsePatchEnvelopeObject(JSON.parse(candidate));
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
          return parsePatchEnvelopeObject(JSON.parse(candidate));
        } catch {
          return null;
        }
      }
    }
    return parsePatchEnvelopeObject(record);
  }

  return null;
}

export function buildCoworkerPatchApplyEnvelope(params: {
  result:
    | {
        status: "applied";
        coworker: CoworkerPatchApplyEnvelopeCoworker;
        appliedChanges: string[];
      }
    | {
        status: "conflict";
        coworker: CoworkerPatchApplyEnvelopeCoworker;
        message: string;
      }
    | {
        status: "validation_error";
        message: string;
        details: string[];
      };
  coworkerId: string;
}): CoworkerPatchApplyEnvelope {
  if (params.result.status === "applied") {
    return {
      kind: COWORKER_PATCH_APPLY_ENVELOPE_KIND,
      status: "applied",
      coworkerId: params.coworkerId,
      appliedChanges: params.result.appliedChanges,
      coworker: params.result.coworker,
      message:
        params.result.appliedChanges.length > 0
          ? `Applied coworker changes: ${params.result.appliedChanges.join(", ")}.`
          : "No coworker changes were needed.",
    };
  }

  if (params.result.status === "conflict") {
    return {
      kind: COWORKER_PATCH_APPLY_ENVELOPE_KIND,
      status: "conflict",
      coworkerId: params.coworkerId,
      coworker: params.result.coworker,
      message: params.result.message,
    };
  }

  return {
    kind: COWORKER_PATCH_APPLY_ENVELOPE_KIND,
    status: "validation_error",
    coworkerId: params.coworkerId,
    message: params.result.message,
    details: params.result.details,
  };
}

export function getCoworkerCliSystemPrompt(): string {
  return [
    "## Coworker Invocation",
    "When the user explicitly mentions one or more coworker handles such as @sales-digest, treat that as a request to delegate work to those coworkers.",
    "Before invoking any coworker, run `coworker list --json` to inspect the currently available coworkers and verify the exact usernames.",
    "To launch a coworker, use `coworker invoke --username <username> --message <explicit task> --json`.",
    "If the user uploaded relevant files, forward them with repeated `--attachment <sandbox-path>` arguments.",
    "To persist a file for future runs of a coworker, use `coworker upload-document <coworker-id> --file <sandbox-path> --json`.",
    "Do not guess coworker usernames. If a mention cannot be resolved exactly, explain the mismatch and stop.",
    "When multiple coworker mentions are present, invoke each coworker separately.",
    "Always use `--json` for `coworker invoke` so CmdClaw can render a coworker invocation card in chat.",
  ].join("\n");
}
