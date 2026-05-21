import type { GenerationEvent } from "./types";
import type {
  GenerationCompletionReason,
  GenerationStatus,
  GenerationTerminalStatus,
  GenerationTurnKind,
  StartedGeneration,
} from "./types";

/**
 * Transactional owner of generation product state.
 *
 * Callers ask for product transitions. The store owns the database writes and
 * coupled side effects required to keep generation, conversation, coworker run,
 * runtime binding, interrupts, usage, terminal message, and queued-message state
 * consistent.
 */
export interface LifecycleStore {
  createRunningTurn(input: CreateRunningTurnInput): Promise<StartedGeneration>;
  loadTurn(input: LoadTurnInput): Promise<TurnRecord | null>;
  claimTurnForRun(input: ClaimTurnForRunInput): Promise<ClaimedTurn | null>;

  markAwaitingDecision(input: MarkAwaitingDecisionInput): Promise<TurnRecord>;
  markPausedForDeadline(input: MarkPausedForDeadlineInput): Promise<TurnRecord>;
  resumeAfterDecision(input: ResumeAfterDecisionInput): Promise<TurnRecord>;
  requestCancellation(input: RequestCancellationInput): Promise<boolean>;

  appendProgress(input: AppendProgressInput): Promise<void>;
  finishTurn(input: FinishTurnInput): Promise<FinishedTurn>;
  finishDetachedTurn(input: FinishDetachedTurnInput): Promise<FinishedTurn>;
}

export type CreateRunningTurnInput = {
  kind: GenerationTurnKind;
  conversationId: string;
  userId: string;
  userMessageId: string;
  executionPolicy: unknown;
  runtimeBinding: RuntimeBinding;
  deadlineAt: Date;
  runBudgetMs: number;
  debugInfo?: unknown;
};

export type LoadTurnInput = {
  generationId: string;
  userId?: string;
};

export type ClaimTurnForRunInput = {
  generationId: string;
  workerId: string;
};

export type MarkAwaitingDecisionInput = {
  generationId: string;
  interruptId: string;
  decisionKind: "approval" | "auth" | "runtime_question" | "plugin_write";
  remainingRunMs: number;
  suspendedAt: Date;
  runtimeSnapshot?: RuntimeSnapshotRef;
};

export type MarkPausedForDeadlineInput = {
  generationId: string;
  remainingRunMs: number;
  suspendedAt: Date;
  runtimeSnapshot?: RuntimeSnapshotRef;
};

export type ResumeAfterDecisionInput = {
  generationId: string;
  interruptId: string;
  deadlineAt: Date;
};

export type RequestCancellationInput = {
  generationId: string;
  userId: string;
};

export type AppendProgressInput = {
  generationId: string;
  contentParts: unknown[];
  usage?: { inputTokens: number; outputTokens: number };
  deadlineAt?: Date;
  remainingRunMs?: number | null;
  lastRuntimeEventAt: Date;
  debugInfo?: unknown;
};

export type FinishTurnInput = {
  generationId: string;
  status: GenerationTerminalStatus;
  completionReason: GenerationCompletionReason;
  assistantContent?: string;
  contentParts: unknown[];
  usage: { inputTokens: number; outputTokens: number };
  errorMessage?: string | null;
  debugInfo?: unknown;
  completedAt: Date;
  generatedSandboxFileIds?: string[];
};

export type FinishDetachedTurnInput = {
  generationId: string;
  status: "error" | "cancelled";
  completionReason: GenerationCompletionReason;
  errorMessage?: string | null;
  completedAt: Date;
};

export type FinishedTurn = {
  generationId: string;
  conversationId: string;
  userId: string;
  status: GenerationTerminalStatus;
  messageId?: string;
  terminalEvent: GenerationEvent;
};

export type TurnRecord = {
  generationId: string;
  conversationId: string;
  userId: string;
  kind: GenerationTurnKind;
  status: GenerationStatus;
  runtimeBinding?: RuntimeBinding;
  currentInterruptId?: string | null;
  resumeInterruptId?: string | null;
  deadlineAt?: Date | null;
  remainingRunMs?: number | null;
  suspendedAt?: Date | null;
  completionReason?: GenerationCompletionReason | null;
  contentParts: unknown[];
  usage: { inputTokens: number; outputTokens: number };
};

export type ClaimedTurn = TurnRecord & {
  leaseToken: string;
};

export type RuntimeBinding = {
  runtimeId: string;
  turnSeq: number;
  sessionId?: string | null;
  sandboxId?: string | null;
};

export type RuntimeSnapshotRef = {
  conversationId: string;
  sessionId: string;
  provider?: string;
};

