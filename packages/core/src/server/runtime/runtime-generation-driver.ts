import type {
  RuntimeDriver,
  RuntimeActionableEvent,
  RuntimeApprovalRequest,
  RuntimeReattachTurnInput,
  RuntimeStartTurnInput,
  RuntimeToolRef,
} from "./runtime-driver";
import type { RuntimeFailureClassification } from "../services/lifecycle-policy";
import type { GenerationContext } from "../services/generation/types";

export type RuntimeClientHandle = unknown;
export type RuntimeContinuationPromptPart = unknown;

export type RuntimeRecoveryReattachOptions = {
  allowSnapshotRestore?: boolean;
  requireLiveSession?: boolean;
  resumeInterruptId?: string;
  modeLabel?: string;
  onRuntimeAttached?: (
    runtimeClient: RuntimeClientHandle,
  ) => Promise<RuntimeContinuationPromptPart[] | void>;
  completeAfterRuntimeAttached?: boolean;
  skipUsageCaptureAfterRuntimeAttached?: boolean;
};

export interface GenerationRuntimeDriver extends RuntimeDriver {
  setRuntimeFailureResolver?(
    resolver: (
      ctx: GenerationContext,
      runtimeClient?: RuntimeClientHandle,
    ) => Promise<RuntimeFailureClassification>,
  ): void;
  bindGenerationContext?(ctx: GenerationContext): void;
  handleRuntimeActionableEvent?(
    ctx: GenerationContext,
    event: RuntimeActionableEvent,
    sendRuntimeDecision: (request: RuntimeApprovalRequest) => Promise<void>,
  ): Promise<{ type: "none" | "permission" | "question" }>;
  updateRuntimeToolPart?(
    runtimeClient: RuntimeClientHandle,
    runtimeTool: RuntimeToolRef,
    patch:
      | { status: "completed"; input: Record<string, unknown>; output: string }
      | { status: "error"; input: Record<string, unknown>; error: string },
  ): Promise<void>;
  resolveRuntimeFailure?(
    ctx: GenerationContext,
    runtimeClient?: RuntimeClientHandle,
  ): Promise<RuntimeFailureClassification>;
}

export type RuntimeGenerationDriverDependencies = {
  runtimeDriver: GenerationRuntimeDriver;
};

export class RuntimeGenerationDriver {
  constructor(private readonly deps: RuntimeGenerationDriverDependencies) {
    this.deps.runtimeDriver.setRuntimeFailureResolver?.((ctx, runtimeClient) =>
      this.resolveRuntimeFailure(ctx, runtimeClient),
    );
  }

  async runNormal(ctx: GenerationContext): Promise<void> {
    this.deps.runtimeDriver.bindGenerationContext?.(ctx);
    const turn = await this.deps.runtimeDriver.startTurn(
      this.toStartTurnInput(ctx),
    );
    await this.drainEvents(turn.events);
    await turn.completion;
  }

  async runRecoveryReattach(
    ctx: GenerationContext,
    options?: RuntimeRecoveryReattachOptions,
  ): Promise<void> {
    this.deps.runtimeDriver.bindGenerationContext?.(ctx);
    const turn = await this.deps.runtimeDriver.reattachTurn(
      this.toReattachTurnInput(ctx, options),
    );
    await this.drainEvents(turn.events);
    await turn.completion;
  }

  async updateRuntimeToolPart(
    runtimeClient: RuntimeClientHandle,
    runtimeTool: RuntimeToolRef,
    patch:
      | { status: "completed"; input: Record<string, unknown>; output: string }
      | { status: "error"; input: Record<string, unknown>; error: string },
  ): Promise<void> {
    await this.deps.runtimeDriver.updateRuntimeToolPart?.(
      runtimeClient,
      runtimeTool,
      patch,
    );
  }

  async resolveRuntimeFailure(
    ctx: GenerationContext,
    runtimeClient?: RuntimeClientHandle,
  ): Promise<RuntimeFailureClassification> {
    if (!this.deps.runtimeDriver.resolveRuntimeFailure) {
      return "terminal_failed";
    }
    return await this.deps.runtimeDriver.resolveRuntimeFailure(ctx, runtimeClient);
  }

  async handleRuntimeActionableEvent(
    ctx: GenerationContext,
    event: RuntimeActionableEvent,
    sendRuntimeDecision: (request: RuntimeApprovalRequest) => Promise<void>,
  ): Promise<{ type: "none" | "permission" | "question" }> {
    if (!this.deps.runtimeDriver.handleRuntimeActionableEvent) {
      return { type: "none" };
    }
    return await this.deps.runtimeDriver.handleRuntimeActionableEvent(
      ctx,
      event,
      sendRuntimeDecision,
    );
  }

  private toStartTurnInput(ctx: GenerationContext): RuntimeStartTurnInput {
    return {
      generationId: ctx.id,
      conversationId: ctx.conversationId,
      userId: ctx.userId,
      model: ctx.model,
      authSource: ctx.authSource ?? null,
      prompt: {
        user: ctx.userMessageContent,
        metadata: { runMode: "normal" },
      },
      environment: ctx.executionEnvironment as RuntimeStartTurnInput["environment"],
      runtimeBinding: {
        runtimeId: ctx.runtimeId ?? "",
        turnSeq: ctx.runtimeTurnSeq ?? 0,
        sessionId: ctx.sessionId ?? null,
      },
    };
  }

  private toReattachTurnInput(
    ctx: GenerationContext,
    options?: RuntimeRecoveryReattachOptions,
  ): RuntimeReattachTurnInput {
    return {
      generationId: ctx.id,
      conversationId: ctx.conversationId,
      userId: ctx.userId,
      environment: ctx.executionEnvironment as RuntimeReattachTurnInput["environment"],
      runtimeBinding: {
        runtimeId: ctx.runtimeId ?? "",
        turnSeq: ctx.runtimeTurnSeq ?? 0,
        sessionId: ctx.sessionId ?? null,
      },
      requireLiveSession: options?.requireLiveSession ?? true,
      allowSnapshotRestore: options?.allowSnapshotRestore ?? false,
      recovery: options,
    } as RuntimeReattachTurnInput;
  }

  private async drainEvents(events: AsyncIterable<unknown>): Promise<void> {
    for await (const _event of events) {
      // Runtime adapters may either apply events internally during migration or
      // yield normalized events for a pure turn-runner loop. Draining keeps the
      // generation path coupled to the runtime seam instead of adapter classes.
    }
  }
}
