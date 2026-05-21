import type { ProviderAuthSource } from "../../../../../packages/core/src/lib/provider-auth-source";
import type { IntegrationType } from "../../../../../packages/core/src/server/oauth/config";
import type {
  GenerationStatusView,
  QueuedConversationTurn,
  StartedGeneration,
  UserFileAttachment,
} from "./types";
import type { GenerationStreamEnvelope } from "./event-log";

/**
 * Public product facade.
 *
 * This is the only module application callers should use. It can preserve the
 * current GenerationManager method names during the rewrite, but it should stay
 * thin: validate caller-level inputs, delegate to product modules, and avoid
 * runtime/sandbox/protocol knowledge.
 */
export interface GenerationManagerFacade {
  startGeneration(input: StartChatGenerationInput): Promise<StartedGeneration>;
  startCoworkerGeneration(input: StartCoworkerGenerationInput): Promise<StartedGeneration>;
  runQueuedGeneration(generationId: string, mode?: GenerationRunMode): Promise<void>;

  cancelGeneration(generationId: string, userId: string): Promise<boolean>;
  resumeGeneration(generationId: string, userId: string): Promise<boolean>;
  getGenerationStatus(generationId: string): Promise<GenerationStatusView | null>;

  submitApproval(
    generationId: string,
    toolUseId: string,
    decision: "approve" | "deny",
    userId: string,
    questionAnswers?: string[][],
  ): Promise<boolean>;
  submitApprovalByInterrupt(
    interruptId: string,
    decision: "approve" | "deny",
    userId: string,
    questionAnswers?: string[][],
  ): Promise<boolean>;
  submitAuthResult(
    generationId: string,
    integration: string,
    success: boolean,
    userId: string,
  ): Promise<boolean>;
  submitAuthResultByInterrupt(
    interruptId: string,
    integration: string,
    success: boolean,
    userId: string,
  ): Promise<boolean>;

  waitForApproval(generationId: string, request: PluginWriteRequest): Promise<"allow" | "deny">;
  waitForAuth(
    generationId: string,
    request: AuthRequest,
  ): Promise<{ success: boolean; userId?: string }>;

  enqueueConversationMessage(
    input: EnqueueConversationTurnInput,
  ): Promise<{ queuedMessageId: string }>;
  listConversationQueuedMessages(
    conversationId: string,
    userId: string,
  ): Promise<QueuedConversationTurn[]>;
  updateConversationQueuedMessage(input: UpdateConversationTurnInput): Promise<boolean>;
  removeConversationQueuedMessage(
    queuedMessageId: string,
    conversationId: string,
    userId: string,
  ): Promise<boolean>;
  processConversationQueuedMessages(conversationId: string): Promise<void>;

  subscribeToGeneration(
    generationId: string,
    userId: string,
    options?: { cursor?: string },
  ): AsyncIterable<GenerationStreamEnvelope>;
}

export type GenerationRunMode = "normal_run" | "recovery_reattach";

export type StartChatGenerationInput = {
  conversationId?: string;
  content: string;
  model?: string;
  authSource?: ProviderAuthSource | null;
  userId: string;
  autoApprove?: boolean;
  sandboxProvider?: "e2b" | "daytona" | "docker";
  resumePausedGenerationId?: string;
  debugRunDeadlineMs?: number;
  debugApprovalHotWaitMs?: number;
  allowedIntegrations?: IntegrationType[];
  fileAttachments?: UserFileAttachment[];
  selectedPlatformSkillSlugs?: string[];
};

export type StartCoworkerGenerationInput = {
  coworkerId: string;
  coworkerRunId: string;
  content: string;
  model?: string;
  authSource?: ProviderAuthSource | null;
  userId: string;
  workspaceId?: string | null;
  autoApprove: boolean;
  sandboxProvider?: "e2b" | "daytona" | "docker";
  allowedIntegrations: IntegrationType[];
  allowedCustomIntegrations?: string[];
  allowedExecutorSourceIds?: string[];
  allowedSkillSlugs?: string[];
  fileAttachments?: UserFileAttachment[];
};

export type PluginWriteRequest = {
  toolInput: Record<string, unknown>;
  integration: string;
  operation: string;
  command: string;
};

export type AuthRequest = {
  integration: string;
  reason?: string;
};

export type EnqueueConversationTurnInput = {
  conversationId: string;
  userId: string;
  content: string;
  fileAttachments?: UserFileAttachment[];
  selectedPlatformSkillSlugs?: string[];
  replaceExisting?: boolean;
};

export type UpdateConversationTurnInput = {
  queuedMessageId: string;
  conversationId: string;
  userId: string;
  content: string;
  fileAttachments?: UserFileAttachment[];
  selectedPlatformSkillSlugs?: string[];
};
