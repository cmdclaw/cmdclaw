import { db } from "@cmdclaw/db/client";
import { conversation, generation, message, type ContentPart } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { parseModelReference } from "../../../../lib/model-reference";
import {
  emitCanonicalServiceEvent,
  recordCounter,
  recordHistogram,
} from "../../../utils/observability";

type GenerationTerminalOutcome = "completed" | "failed" | "cancelled" | "timed_out";

type ToolSummary = {
  toolCallCount: number;
  toolWriteCount: number;
  approvalCount: number;
  authInterruptionCount: number;
};

const UNKNOWN = "unknown";

function resolveTerminalOutcome(
  status: string,
  completionReason: string | null | undefined,
): GenerationTerminalOutcome {
  if (status === "completed") {
    return "completed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (
    completionReason === "run_deadline" ||
    completionReason === "approval_timeout" ||
    completionReason === "auth_timeout" ||
    completionReason === "bootstrap_timeout"
  ) {
    return "timed_out";
  }
  return "failed";
}

function resolveFailurePhase(completionReason: string | null | undefined): string {
  switch (completionReason) {
    case "approval_timeout":
      return "approval";
    case "auth_timeout":
      return "auth";
    case "bootstrap_timeout":
      return "bootstrap";
    case "run_deadline":
      return "run_deadline";
    case "user_cancel":
      return "user_cancel";
    case "runtime_error":
      return "runtime";
    case "completed":
      return "none";
    default:
      return completionReason ? "runtime" : "unknown";
  }
}

function normalizeErrorCode(args: {
  outcome: GenerationTerminalOutcome;
  completionReason?: string | null;
  errorMessage?: string | null;
}): string {
  if (args.outcome === "completed" || args.outcome === "cancelled") {
    return "none";
  }
  if (args.completionReason) {
    return args.completionReason;
  }

  const message = args.errorMessage?.toLowerCase() ?? "";
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (message.includes("auth") || message.includes("401") || message.includes("403")) {
    return "auth_error";
  }
  if (message.includes("rate limit")) {
    return "rate_limited";
  }
  return "unknown_error";
}

function summarizeTools(contentParts: ContentPart[] | null | undefined): ToolSummary {
  const summary: ToolSummary = {
    toolCallCount: 0,
    toolWriteCount: 0,
    approvalCount: 0,
    authInterruptionCount: 0,
  };

  for (const part of contentParts ?? []) {
    if (part.type === "tool_use") {
      summary.toolCallCount += 1;
    } else if (part.type === "approval") {
      summary.approvalCount += 1;
      if (part.operation && /write|create|update|delete|send|post/i.test(part.operation)) {
        summary.toolWriteCount += 1;
      }
    } else if (part.type === "system" && /auth/i.test(part.content)) {
      summary.authInterruptionCount += 1;
    }
  }

  return summary;
}

function getGenerationDurationMs(args: {
  startedAt: Date | null;
  completedAt: Date | null;
  timing?: { generationDurationMs?: number } | null;
}): number | undefined {
  if (typeof args.timing?.generationDurationMs === "number") {
    return Math.max(0, args.timing.generationDurationMs);
  }
  if (args.startedAt && args.completedAt) {
    return Math.max(0, args.completedAt.getTime() - args.startedAt.getTime());
  }
  return undefined;
}

function getProviderFromModel(model: string | null | undefined): string {
  if (!model) {
    return UNKNOWN;
  }
  try {
    return parseModelReference(model).providerID;
  } catch {
    return model.includes("/") ? model.split("/")[0] || UNKNOWN : UNKNOWN;
  }
}

function recordGenerationTerminalMetrics(args: {
  outcome: GenerationTerminalOutcome;
  modelProvider: string;
  sandboxProvider: string;
  failurePhase: string;
  normalizedErrorCode: string;
  durationMs?: number;
  toolCallCount: number;
}): void {
  const labels = {
    outcome: args.outcome,
    model_provider: args.modelProvider,
    sandbox_provider: args.sandboxProvider,
    failure_phase: args.failurePhase,
    normalized_error_code: args.normalizedErrorCode,
  };

  recordCounter(
    "cmdclaw_generation_terminal_total",
    1,
    labels,
    "Terminal Generation outcomes by bounded operational dimensions.",
  );
  if (args.durationMs !== undefined) {
    recordHistogram(
      "cmdclaw_generation_terminal_duration_ms",
      args.durationMs,
      labels,
      "Terminal Generation duration in milliseconds.",
    );
  }
  recordHistogram(
    "cmdclaw_generation_terminal_tool_calls",
    args.toolCallCount,
    labels,
    "Tool call count per terminal Generation.",
  );
}

export async function emitGenerationTerminalCanonicalEvent(generationId: string): Promise<void> {
  const genRecord = await db.query.generation.findFirst({
    where: eq(generation.id, generationId),
    with: { conversation: true },
  });

  if (!genRecord) {
    return;
  }

  const messageRecord = genRecord.messageId
    ? await db.query.message.findFirst({
        where: eq(message.id, genRecord.messageId),
        columns: { timing: true },
      })
    : null;
  const conv =
    genRecord.conversation ??
    (await db.query.conversation.findFirst({
      where: eq(conversation.id, genRecord.conversationId),
    }));

  const outcome = resolveTerminalOutcome(genRecord.status, genRecord.completionReason);
  const failurePhase = resolveFailurePhase(genRecord.completionReason);
  const normalizedErrorCode = normalizeErrorCode({
    outcome,
    completionReason: genRecord.completionReason,
    errorMessage: genRecord.errorMessage,
  });
  const modelProvider = getProviderFromModel(conv?.model);
  const sandboxProvider =
    genRecord.sandboxProvider ??
    genRecord.executionPolicy?.sandboxProvider ??
    conv?.lastSandboxProvider ??
    UNKNOWN;
  const durationMs = getGenerationDurationMs({
    startedAt: genRecord.startedAt,
    completedAt: genRecord.completedAt,
    timing: messageRecord?.timing,
  });
  const toolSummary = summarizeTools(genRecord.contentParts);
  const timing = messageRecord?.timing;

  emitCanonicalServiceEvent({
    level: outcome === "failed" || outcome === "timed_out" ? "error" : "info",
    eventName: "cmdclaw.generation.terminal",
    operationName: "generation.terminal",
    eventId: `generation:${generationId}:terminal`,
    outcome,
    context: {
      source: "generation-lifecycle",
      traceId: genRecord.traceId ?? undefined,
      generationId,
      conversationId: genRecord.conversationId,
      userId: conv?.userId ?? undefined,
      sandboxId: genRecord.sandboxId ?? undefined,
      sessionId: genRecord.runtimeId ?? undefined,
    },
    attributes: {
      "cmdclaw.generation.id": generationId,
      "cmdclaw.conversation.id": genRecord.conversationId,
      "cmdclaw.user.id": conv?.userId ?? undefined,
      "cmdclaw.workspace.id": conv?.workspaceId ?? undefined,
      "cmdclaw.generation.outcome": outcome,
      "cmdclaw.generation.status": genRecord.status,
      "cmdclaw.generation.completion_reason": genRecord.completionReason ?? UNKNOWN,
      "cmdclaw.generation.failure_phase": failurePhase,
      "cmdclaw.error.normalized_code": normalizedErrorCode,
      "cmdclaw.model.provider": modelProvider,
      "cmdclaw.sandbox.provider": sandboxProvider,
      "cmdclaw.sandbox.id": genRecord.sandboxId ?? undefined,
      "cmdclaw.runtime.id": genRecord.runtimeId ?? undefined,
      "cmdclaw.runtime.harness": genRecord.runtimeHarness ?? undefined,
      "cmdclaw.runtime.protocol_version": genRecord.runtimeProtocolVersion ?? undefined,
      "cmdclaw.generation.duration_ms": durationMs,
      "cmdclaw.generation.input_tokens": genRecord.inputTokens,
      "cmdclaw.generation.output_tokens": genRecord.outputTokens,
      "cmdclaw.generation.tool_call_count": toolSummary.toolCallCount,
      "cmdclaw.generation.tool_write_count": toolSummary.toolWriteCount,
      "cmdclaw.generation.approval_count": toolSummary.approvalCount,
      "cmdclaw.generation.auth_interruption_count": toolSummary.authInterruptionCount,
      "cmdclaw.generation.phase_durations_ms": timing?.phaseDurationsMs,
      "cmdclaw.generation.sandbox_startup_mode": timing?.sandboxStartupMode,
      "cmdclaw.generation.started_at": genRecord.startedAt,
      "cmdclaw.generation.completed_at": genRecord.completedAt ?? undefined,
    },
  });

  recordGenerationTerminalMetrics({
    outcome,
    modelProvider,
    sandboxProvider,
    failurePhase,
    normalizedErrorCode,
    durationMs,
    toolCallCount: toolSummary.toolCallCount,
  });
}
