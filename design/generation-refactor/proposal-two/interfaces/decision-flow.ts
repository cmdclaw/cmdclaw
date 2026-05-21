import type { LifecycleStore, TurnRecord } from "./lifecycle-store";
import type {
  RuntimeDecisionResolution,
  RuntimeDriver,
  RuntimeInterruptRequest,
} from "./runtime-driver";
import type { GenerationEvent } from "./types";

/**
 * One owner for every external decision needed before a turn can continue.
 *
 * This includes plugin writes, runtime permissions, runtime questions, and auth.
 * It owns interrupt persistence and resolution, while product status changes go
 * through LifecycleStore.
 */
export interface DecisionFlow {
  request(input: RequestDecisionInput): Promise<RequestDecisionResult>;
  resolve(input: ResolveDecisionInput): Promise<ResolveDecisionResult>;
  expire(input: ExpireDecisionInput): Promise<ExpireDecisionResult>;
  applyToRuntime(input: ApplyDecisionToRuntimeInput): Promise<ApplyDecisionResult>;
}

export type DecisionFlowDependencies = {
  lifecycle: LifecycleStore;
  runtime: RuntimeDriver;
};

export type RequestDecisionInput = {
  turn: TurnRecord;
  request: RuntimeInterruptRequest | PluginWriteDecisionRequest | AuthDecisionRequest;
  autoApprove: boolean;
  now: Date;
};

export type PluginWriteDecisionRequest = {
  kind: "plugin_write";
  providerRequestId: string;
  title: string;
  integration: string;
  operation: string;
  command: string;
  toolInput: Record<string, unknown>;
  runtimeTool?: unknown;
};

export type AuthDecisionRequest = {
  kind: "auth";
  providerRequestId: string;
  integration: string;
  reason?: string;
};

export type RequestDecisionResult =
  | { outcome: "accepted" }
  | {
      outcome: "pending";
      interruptId: string;
      expiresAt?: Date;
      event: GenerationEvent;
    }
  | { outcome: "rejected"; reason: string };

export type ResolveDecisionInput = {
  interruptId: string;
  userId: string;
  resolution: DecisionResolution;
  now: Date;
};

export type DecisionResolution =
  | { kind: "approval"; decision: "approve" | "deny"; questionAnswers?: string[][] }
  | { kind: "runtime_question"; decision: "approve" | "deny"; answers?: string[][] }
  | { kind: "plugin_write"; decision: "approve" | "deny" }
  | { kind: "auth"; success: boolean; integration: string };

export type ResolveDecisionResult = {
  generationId: string;
  conversationId: string;
  resolved: boolean;
  shouldResume: boolean;
  event?: GenerationEvent;
};

export type ExpireDecisionInput = {
  generationId: string;
  interruptId?: string;
  kind?: "approval" | "auth" | "runtime_question" | "plugin_write";
  now: Date;
};

export type ExpireDecisionResult = {
  expired: boolean;
  generationId?: string;
  shouldFinalize: boolean;
  event?: GenerationEvent;
};

export type ApplyDecisionToRuntimeInput = {
  generationId: string;
  interruptId: string;
  resolution: RuntimeDecisionResolution;
};

export type ApplyDecisionResult = {
  applied: boolean;
  continuationPrompt?: string;
};
