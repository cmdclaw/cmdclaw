import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import IORedis from "ioredis";
import path from "path";
import type { IntegrationType } from "../oauth/config";
import type {
  RuntimeEvent,
  RuntimeHarnessClient,
  RuntimePart,
  RuntimePermissionRequest,
  RuntimePromptPart,
  RuntimeQuestionRequest,
} from "../sandbox/core/types";
import type { SandboxBackend } from "../sandbox/types";
import { env } from "../../env";
import {
  CUSTOM_SKILL_PREFIX,
  normalizeCoworkerAllowedSkillSlugs,
  splitCoworkerAllowedSkillSlugs,
} from "../../lib/coworker-tool-policy";
import {
  getCoworkerCliSystemPrompt,
  parseCoworkerInvocationEnvelope,
} from "../../lib/coworker-runtime-cli";
import { parseModelReference } from "../../lib/model-reference";
import {
  normalizeModelAuthSource,
  type ProviderAuthSource,
} from "../../lib/provider-auth-source";
import {
  listOpencodeFreeModels,
  resolveDefaultOpencodeFreeModel,
} from "../ai/opencode-models";
import { parseBashCommand } from "../ai/permission-checker";
import { getProviderModels } from "../ai/subscription-providers";
import { trackGenerationBilling } from "../billing/service";
import { hasConnectedProviderAuthForUser } from "../control-plane/subscription-providers";
import { db } from "@cmdclaw/db/client";
import {
  conversation,
  conversationQueuedMessage,
  generation,
  generationInterrupt,
  message,
  messageAttachment,
  skill,
  user,
  coworker,
  coworkerRun,
  coworkerRunEvent,
  type ContentPart,
  type GenerationExecutionPolicy,
  type MessageTiming,
  type PendingApproval,
  type PendingAuth,
  type QueuedMessageAttachment,
} from "@cmdclaw/db/schema";
import { customIntegrationCredential } from "@cmdclaw/db/schema";
import {
  getCliEnvForUser,
  getCliInstructionsWithCustom,
  getEnabledIntegrationTypes,
} from "../integrations/cli-env";
import { getChatSystemBehaviorPrompt } from "../prompts/chat-system-behavior-prompt";
import { getCoworkerSystemBehaviorPrompt } from "../prompts/coworker-system-behavior-prompt";
import {
  buildQueueJobId,
  CHAT_GENERATION_JOB_NAME,
  CONVERSATION_QUEUED_MESSAGE_PROCESS_JOB_NAME,
  GENERATION_APPROVAL_TIMEOUT_JOB_NAME,
  GENERATION_AUTH_TIMEOUT_JOB_NAME,
  GENERATION_PREPARING_STUCK_CHECK_JOB_NAME,
  COWORKER_GENERATION_JOB_NAME,
  getQueue,
} from "../queues";
import { buildRedisOptions } from "../redis/connection-options";
import {
  generationStreamExists,
  getLatestGenerationStreamEnvelope,
  getLatestGenerationStreamCursor,
  publishGenerationStreamEvent,
  readGenerationStreamAfter,
  type GenerationStreamEnvelope,
} from "../redis/generation-event-bus";
import { getOrCreateConversationRuntime } from "../sandbox/core/orchestrator";
import {
  buildMemorySystemPrompt,
  syncMemoryFilesToSandbox,
} from "../sandbox/prep/memory-prep";
import {
  getIntegrationSkillsSystemPrompt,
  getSkillsSystemPrompt,
  writeResolvedIntegrationSkillsToSandbox,
  writeSkillsToSandbox,
} from "../sandbox/prep/skills-prep";
import {
  applyCoworkerBuilderPatch,
  extractCoworkerBuilderPatch,
  resolveCoworkerBuilderContextByConversation,
  type CoworkerBuilderContext,
} from "./coworker-builder-service";
import { generateCoworkerMetadataOnFirstPromptFill } from "./coworker-metadata";
import { createCommunityIntegrationSkill } from "./integration-skill-service";
import { writeSessionTranscriptFromConversation } from "./memory-service";
import { resolveSelectedPlatformSkillSlugs } from "./platform-skill-service";
import { uploadSandboxFile, collectNewSandboxFiles } from "./sandbox-file-service";
import { getSandboxSlotManager } from "./sandbox-slot-manager";
import { SESSION_BOUNDARY_PREFIX } from "./session-constants";
import { sendTaskDonePush } from "./web-push-service";
import { generateConversationTitle } from "../utils/generate-title";
import { createTraceId, logServerEvent } from "../utils/observability";
import { isStatelessServerlessRuntime } from "../utils/runtime-platform";
import {
  generationInterruptService,
  type GenerationInterruptEventPayload,
  type GenerationInterruptKind,
  type GenerationInterruptRecord,
} from "./generation-interrupt-service";

let cachedDefaultCoworkerModelPromise: Promise<string> | undefined;

async function resolveCoworkerModel(model?: string): Promise<string> {
  const configured = model?.trim();
  if (configured) {
    parseModelReference(configured);
    return configured;
  }

  if (!cachedDefaultCoworkerModelPromise) {
    cachedDefaultCoworkerModelPromise = resolveDefaultOpencodeFreeModel();
  }

  return cachedDefaultCoworkerModelPromise;
}

function resolveModelAuthSource(params: {
  model: string;
  authSource?: ProviderAuthSource | null;
}): ProviderAuthSource | null {
  return normalizeModelAuthSource({
    model: params.model,
    authSource: params.authSource,
  });
}

// Event types for generation stream
export type GenerationEvent =
  | { type: "text"; content: string }
  | { type: "system"; content: string; coworkerId?: string }
  | {
      type: "tool_use";
      toolName: string;
      toolInput: unknown;
      toolUseId?: string;
      integration?: string;
      operation?: string;
      isWrite?: boolean;
    }
  | { type: "tool_result"; toolName: string; result: unknown; toolUseId?: string }
  | { type: "thinking"; content: string; thinkingId: string }
  | ({ type: "interrupt_pending" } & GenerationInterruptEventPayload)
  | ({ type: "interrupt_resolved" } & GenerationInterruptEventPayload)
  | {
      type: "sandbox_file";
      fileId: string;
      path: string;
      filename: string;
      mimeType: string;
      sizeBytes: number | null;
    }
  | {
      type: "done";
      generationId: string;
      conversationId: string;
      messageId: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalCostUsd: number;
      };
      artifacts?: {
        timing?: MessageTiming;
        attachments: Array<{
          id: string;
          filename: string;
          mimeType: string;
          sizeBytes: number;
        }>;
        sandboxFiles: Array<{
          fileId: string;
          path: string;
          filename: string;
          mimeType: string;
          sizeBytes: number | null;
        }>;
      };
    }
  | { type: "error"; message: string }
  | {
      type: "cancelled";
      generationId: string;
      conversationId: string;
      messageId?: string;
    }
  | {
      type: "status_change";
      status: string;
      metadata?: {
        sandboxProvider?: "e2b" | "daytona" | "docker";
        runtimeHarness?: "opencode" | "agent-sdk";
        runtimeProtocolVersion?: "opencode-v2" | "sandbox-agent-v1";
        sandboxId?: string;
        sessionId?: string;
      };
    };

export type GenerationStreamEvent = GenerationEvent & {
  cursor?: string;
};

type GenerationStatus =
  | "running"
  | "awaiting_approval"
  | "awaiting_auth"
  | "paused"
  | "completed"
  | "cancelled"
  | "error";

type BackendType = "opencode";
type OpenCodeTrackedEvent = Extract<
  RuntimeEvent,
  {
    type: "message.updated" | "message.part.updated" | "session.updated" | "session.status";
  }
>;
type OpenCodeActionableEvent = Extract<
  RuntimeEvent,
  { type: "message.part.updated" | "permission.asked" | "question.asked" }
>;
type ApprovalCapableClient =
  | RuntimeHarnessClient
  | {
      permission: {
        reply: (input: { requestID: string; reply: "always" | "reject" }) => Promise<void>;
      };
      question: {
        reply: (input: { requestID: string; answers: string[][] }) => Promise<void>;
        reject: (input: { requestID: string }) => Promise<void>;
      };
    };

interface GenerationContext {
  id: string;
  traceId: string;
  conversationId: string;
  userId: string;
  sandboxId?: string;
  status: GenerationStatus;
  contentParts: ContentPart[];
  assistantContent: string;
  abortController: AbortController;
  pendingApproval: PendingApproval | null;
  approvalTimeoutId?: ReturnType<typeof setTimeout>;
  approvalResolver?: (decision: "allow" | "deny") => void;
  pendingAuth: PendingAuth | null;
  authTimeoutId?: ReturnType<typeof setTimeout>;
  authResolver?: (result: { success: boolean; userId?: string }) => void;
  currentInterruptId?: string;
  runtimeCallbackToken?: string;
  usage: { inputTokens: number; outputTokens: number; totalCostUsd: number };
  sessionId?: string;
  errorMessage?: string;
  startedAt: Date;
  lastSaveAt: Date;
  saveDebounceId?: ReturnType<typeof setTimeout>;
  isNewConversation: boolean;
  model: string;
  authSource?: ProviderAuthSource | null;
  userMessageContent: string;
  // File attachments from user
  attachments?: UserFileAttachment[];
  // Track assistant message IDs to filter out user message parts
  assistantMessageIds: Set<string>;
  messageRoles: Map<string, string>;
  pendingMessageParts: Map<
    string,
    {
      firstQueuedAtMs: number;
      parts: RuntimePart[];
    }
  >;
  backendType: BackendType;
  sandboxProviderOverride?: "e2b" | "daytona" | "docker";
  // Coworker fields
  coworkerRunId?: string;
  allowedIntegrations?: IntegrationType[];
  autoApprove: boolean;
  allowedCustomIntegrations?: string[];
  allowedSkillSlugs?: string[];
  coworkerPrompt?: string;
  coworkerPromptDo?: string;
  coworkerPromptDont?: string;
  triggerPayload?: unknown;
  builderCoworkerContext?: CoworkerBuilderContext | null;
  selectedPlatformSkillSlugs?: string[];
  // Sandbox file collection
  generationMarkerTime?: number;
  sandbox?: SandboxBackend;
  sentFilePaths?: Set<string>;
  userStagedFilePaths?: Set<string>;
  uploadedSandboxFileIds?: Set<string>;
  agentInitStartedAt?: number;
  agentInitReadyAt?: number;
  agentInitFailedAt?: number;
  agentSandboxReadyAt?: number;
  agentSandboxMode?: "created" | "reused" | "unknown";
  phaseMarks?: Record<string, number>;
  phaseTimeline?: Array<{
    phase: string;
    atMs: number;
    elapsedMs: number;
  }>;
  streamSequence: number;
  streamPublishedCount: number;
  streamDeliveredCount: number;
  streamLastCursor?: string;
  streamFirstVisiblePublishedAt?: number;
  streamTerminalPublishedAt?: number;
  lastCancellationCheckAt?: number;
  isFinalizing?: boolean;
  sandboxSlotLeaseToken?: string;
  sandboxSlotLeaseRenewId?: ReturnType<typeof setInterval>;
}

type ModelAccessCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      userMessage: string;
    };

type ToolUseMetadata = {
  integration?: string;
  operation?: string;
  isWrite?: boolean;
};

type PrePromptCacheRecord = {
  version: 1;
  cacheKey: string;
  writtenSkills: string[];
  writtenIntegrationSkills: string[];
  updatedAt: string;
};

const PRE_PROMPT_CACHE_PATH = "/app/.opencode/pre-prompt-cache.json";
const DEFAULT_MODEL_REFERENCE = "anthropic/claude-sonnet-4-6";
const COWORKER_BUILDER_AUTO_APPLY_ENABLED = process.env.COWORKER_BUILDER_AUTO_APPLY !== "0";

async function getDoneArtifacts(messageId: string): Promise<
  | {
      timing?: MessageTiming;
      attachments: Array<{
        id: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
      }>;
      sandboxFiles: Array<{
        fileId: string;
        path: string;
        filename: string;
        mimeType: string;
        sizeBytes: number | null;
      }>;
    }
  | undefined
> {
  const messageRecord = await db.query.message.findFirst({
    where: eq(message.id, messageId),
    with: {
      attachments: true,
      sandboxFiles: true,
    },
  });

  if (!messageRecord) {
    return undefined;
  }

  return {
    timing: messageRecord.timing ?? undefined,
    attachments: messageRecord.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    })),
    sandboxFiles: messageRecord.sandboxFiles.map((file) => ({
      fileId: file.id,
      path: file.path,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    })),
  };
}

// Approval timeout: 5 minutes before pausing sandbox
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
// Auth timeout: 10 minutes for OAuth flow
const AUTH_TIMEOUT_MS = 10 * 60 * 1000;
const CANCELLATION_POLL_INTERVAL_MS = 1000;
const AGENT_PREPARING_TIMEOUT_MS = (() => {
  const seconds = Number(process.env.AGENT_PREPARING_TIMEOUT_SECONDS ?? "300");
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 5 * 60 * 1000;
  }
  return Math.floor(seconds * 1000);
})();
const OPENCODE_PROMPT_TIMEOUT_MS = (() => {
  const seconds = Number(process.env.OPENCODE_PROMPT_TIMEOUT_SECONDS ?? "1500");
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 30 * 1000;
  }
  return Math.floor(seconds * 1000);
})();
const OPENCODE_PROMPT_TIMEOUT_LABEL = `${Math.ceil(OPENCODE_PROMPT_TIMEOUT_MS / 1000)}s`;
// Save debounce interval for text chunks
const SAVE_DEBOUNCE_MS = 2000;
const SESSION_RESET_COMMANDS = new Set(["/new"]);
type GenerationTimeoutKind = "approval" | "auth";
const STALE_REAPER_RUNNING_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const STALE_REAPER_AWAITING_APPROVAL_MAX_AGE_MS = 30 * 60 * 1000;
const STALE_REAPER_AWAITING_AUTH_MAX_AGE_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_PARTS_MAX_PER_MESSAGE = 100;
const PENDING_MESSAGE_PARTS_TTL_MS = 5 * 60 * 1000;
const MAX_TOOL_RESULT_CONTENT_CHARS = 100_000;
const SANDBOX_SLOT_RETRY_DELAY_MS = 2_000;
const GEN_STREAM_SUBSCRIBE_MAX_WAIT_MS = Number.parseInt(
  process.env.GEN_STREAM_SUBSCRIBE_MAX_WAIT_MS ?? "180000",
  10,
);
const GEN_STREAM_DB_RECOVERY_POLL_MS = Number.parseInt(
  process.env.GEN_STREAM_DB_RECOVERY_POLL_MS ?? "1500",
  10,
);

type AutoCollectedSandboxFile = {
  path: string;
  content: Buffer;
};

function extractFinalAnswerTextForFileHeuristic(
  ctx: Pick<GenerationContext, "assistantContent" | "contentParts">,
): string {
  const textFromParts = ctx.contentParts.flatMap((part) => {
    if (!part || typeof part !== "object") {
      return [];
    }
    const record = part as { type?: unknown; text?: unknown; content?: unknown };
    if (record.type === "text" && typeof record.text === "string") {
      return [record.text];
    }
    if (record.type === "system" && typeof record.content === "string") {
      return [record.content];
    }
    return [];
  });

  const segments = [ctx.assistantContent, ...textFromParts].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return segments.join("\n");
}

function filterAutoCollectedFilesMentionedInAnswer(
  files: AutoCollectedSandboxFile[],
  finalAnswerText: string,
): AutoCollectedSandboxFile[] {
  // This heuristic is only for auto-collected files discovered after generation.
  // Files explicitly exposed via the send_file tool bypass this path and are always kept.
  const haystack = finalAnswerText.toLowerCase();
  if (!haystack.trim()) {
    return [];
  }

  return files.filter((file) => {
    const filename = path.basename(file.path).toLowerCase();
    const fullPath = file.path.toLowerCase();
    return haystack.includes(filename) || haystack.includes(fullPath);
  });
}

function extractAssistantTextFromSessionMessagesPayload(payload: unknown): string | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const item = payload[i];
    if (!item || typeof item !== "object") {
      continue;
    }
    const info = (item as Record<string, unknown>).info as Record<string, unknown> | undefined;
    if (info?.role !== "assistant") {
      continue;
    }
    const parts = (item as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    const text = parts
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const entry = part as Record<string, unknown>;
        if (entry.type === "text" && typeof entry.text === "string") {
          return entry.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("");

    if (text.trim()) {
      return text;
    }
  }

  return null;
}

function buildExecutionPolicy(params: {
  allowedIntegrations?: IntegrationType[];
  allowedCustomIntegrations?: string[];
  allowedSkillSlugs?: string[];
  autoApprove: boolean;
  sandboxProvider?: "e2b" | "daytona" | "docker";
  selectedPlatformSkillSlugs?: string[];
  queuedFileAttachments?: UserFileAttachment[];
}): GenerationExecutionPolicy {
  return {
    allowedIntegrations: params.allowedIntegrations,
    allowedCustomIntegrations: params.allowedCustomIntegrations,
    allowedSkillSlugs: params.allowedSkillSlugs,
    autoApprove: params.autoApprove,
    sandboxProvider: params.sandboxProvider,
    selectedPlatformSkillSlugs: params.selectedPlatformSkillSlugs,
    queuedFileAttachments: params.queuedFileAttachments,
  };
}

function getSelectedPlatformSkillPrompt(selectedPlatformSkillSlugs: string[] | undefined): string {
  if (!selectedPlatformSkillSlugs || selectedPlatformSkillSlugs.length === 0) {
    return "";
  }

  const list = selectedPlatformSkillSlugs.map((slug) => `- ${slug}`).join("\n");
  const paths = selectedPlatformSkillSlugs
    .map((slug) => `- /app/.claude/skills/${slug}/SKILL.md`)
    .join("\n");
  return [
    "# Selected Platform Skills",
    "The user selected these platform skills for this generation:",
    list,
    "Prioritize these selected skills before using other platform skills.",
    "Read and follow these SKILL.md files first:",
    paths,
  ].join("\n");
}

function computeExpiryIso(timeoutMs: number): string {
  return new Date(Date.now() + timeoutMs).toISOString();
}

function resolveExpiryMs(
  expiresAt: string | undefined,
  requestedAt: string | undefined,
  timeoutMs: number,
): number {
  const explicit = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  const requested = requestedAt ? Date.parse(requestedAt) : Number.NaN;
  if (Number.isFinite(requested)) {
    return requested + timeoutMs;
  }
  return Date.now() + timeoutMs;
}

function normalizePermissionPattern(pattern: string): string {
  return pattern.replace(/[\s*]+$/g, "").replace(/\/+$/, "");
}

function shouldAutoApproveOpenCodePermission(
  permissionType: string,
  patterns: string[] | undefined,
): boolean {
  if (!patterns?.length) {
    return false;
  }

  return patterns.every((pattern) => {
    const normalized = normalizePermissionPattern(pattern);

    // Allow common sandbox working directories without interactive approval.
    if (
      permissionType === "external_directory" &&
      (normalized.startsWith("/tmp") ||
        normalized.startsWith("/app") ||
        normalized.startsWith("/home"))
    ) {
      return true;
    }

    return false;
  });
}

function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}

function isOpenCodeTrackedEvent(event: RuntimeEvent): event is OpenCodeTrackedEvent {
  return (
    event.type === "message.updated" ||
    event.type === "message.part.updated" ||
    event.type === "session.updated" ||
    event.type === "session.status"
  );
}

function isOpenCodeActionableEvent(event: RuntimeEvent): event is OpenCodeActionableEvent {
  return (
    event.type === "message.part.updated" ||
    event.type === "permission.asked" ||
    event.type === "question.asked"
  );
}

export function buildDefaultQuestionAnswers(request: RuntimeQuestionRequest): string[][] {
  if (request.questions.length === 0) {
    return [["default answer"]];
  }

  return request.questions.map((question) => [question.options?.[0]?.label ?? "default answer"]);
}

export function buildQuestionCommand(request: RuntimeQuestionRequest): string {
  const primaryQuestion = request.questions[0];
  if (!primaryQuestion) {
    return "Question";
  }

  const options = (primaryQuestion.options ?? []).map((option) => option.label).filter(Boolean);
  const optionsText = options.length > 0 ? ` [${options.join(" | ")}]` : "";
  const remainingCount = Math.max(0, request.questions.length - 1);
  const remainingText = remainingCount > 0 ? ` (+${remainingCount} more)` : "";
  return `Question: ${primaryQuestion.question}${optionsText}${remainingText}`;
}

type UserFileAttachment = { name: string; mimeType: string; dataUrl: string };

export type ConversationQueuedMessageRecord = {
  id: string;
  content: string;
  fileAttachments?: QueuedMessageAttachment[];
  selectedPlatformSkillSlugs?: string[];
  status: "queued" | "processing";
  createdAt: Date;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n... (output truncated)`;
}

function limitToolResultContent(value: unknown): unknown {
  if (typeof value === "string") {
    return truncateString(value, MAX_TOOL_RESULT_CONTENT_CHARS);
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_TOOL_RESULT_CONTENT_CHARS) {
      return value;
    }
    return truncateString(serialized, MAX_TOOL_RESULT_CONTENT_CHARS);
  } catch {
    return truncateString(String(value), MAX_TOOL_RESULT_CONTENT_CHARS);
  }
}

class GenerationManager {
  private activeGenerations = new Map<string, GenerationContext>();
  private activeSubscriptionCounts = new Map<string, number>();
  private streamCounters = {
    opened: 0,
    closed: 0,
    timedOut: 0,
    deduped: 0,
  };

  private shouldDeferGenerationToWorker(): boolean {
    return isStatelessServerlessRuntime();
  }

  private getSubscriptionKey(generationId: string, userId: string): string {
    return `${generationId}:${userId}`;
  }

  private async enqueueConversationQueuedMessageProcess(conversationId: string): Promise<void> {
    const queue = getQueue();
    await queue.add(
      CONVERSATION_QUEUED_MESSAGE_PROCESS_JOB_NAME,
      { conversationId },
      {
        jobId: buildQueueJobId([CONVERSATION_QUEUED_MESSAGE_PROCESS_JOB_NAME, conversationId]),
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
  }

  private isActiveGenerationStartError(error: unknown): boolean {
    return error instanceof Error && error.message.includes("Generation already in progress");
  }

  private async persistMessageAttachments(params: {
    conversationId: string;
    messageId: string;
    attachments?: UserFileAttachment[];
  }): Promise<void> {
    const attachments = params.attachments;
    if (!attachments || attachments.length === 0) {
      return;
    }

    const { uploadToS3, ensureBucket } = await import("../storage/s3-client");
    await ensureBucket();

    await Promise.all(
      attachments.map(async (attachment) => {
        const base64Data = attachment.dataUrl.split(",")[1] || "";
        const buffer = Buffer.from(base64Data, "base64");
        const sanitizedFilename = attachment.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const storageKey = `attachments/${params.conversationId}/${params.messageId}/${Date.now()}-${sanitizedFilename}`;
        await uploadToS3(storageKey, buffer, attachment.mimeType);
        await db.insert(messageAttachment).values({
          messageId: params.messageId,
          filename: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: buffer.length,
          storageKey,
        });
      }),
    );
  }

  async enqueueConversationMessage(params: {
    conversationId: string;
    userId: string;
    content: string;
    fileAttachments?: UserFileAttachment[];
    selectedPlatformSkillSlugs?: string[];
    replaceExisting?: boolean;
  }): Promise<{ queuedMessageId: string }> {
    const conv = await db.query.conversation.findFirst({
      where: and(
        eq(conversation.id, params.conversationId),
        eq(conversation.userId, params.userId),
        eq(conversation.type, "chat"),
      ),
      columns: {
        id: true,
      },
    });

    if (!conv) {
      throw new Error("Conversation not found");
    }

    if (params.replaceExisting ?? true) {
      await db
        .delete(conversationQueuedMessage)
        .where(
          and(
            eq(conversationQueuedMessage.conversationId, params.conversationId),
            eq(conversationQueuedMessage.userId, params.userId),
            inArray(conversationQueuedMessage.status, ["queued", "failed"]),
          ),
        );
    }

    const [queued] = await db
      .insert(conversationQueuedMessage)
      .values({
        conversationId: params.conversationId,
        userId: params.userId,
        content: params.content,
        fileAttachments: params.fileAttachments,
        selectedPlatformSkillSlugs: params.selectedPlatformSkillSlugs,
        status: "queued",
      })
      .returning({ id: conversationQueuedMessage.id });

    await this.enqueueConversationQueuedMessageProcess(params.conversationId);
    return { queuedMessageId: queued.id };
  }

  async listConversationQueuedMessages(
    conversationId: string,
    userId: string,
  ): Promise<ConversationQueuedMessageRecord[]> {
    const conv = await db.query.conversation.findFirst({
      where: and(
        eq(conversation.id, conversationId),
        eq(conversation.userId, userId),
        eq(conversation.type, "chat"),
      ),
      columns: {
        id: true,
      },
    });

    if (!conv) {
      return [];
    }

    const rows = await db.query.conversationQueuedMessage.findMany({
      where: and(
        eq(conversationQueuedMessage.conversationId, conversationId),
        eq(conversationQueuedMessage.userId, userId),
        inArray(conversationQueuedMessage.status, ["queued", "processing"]),
      ),
      orderBy: [asc(conversationQueuedMessage.createdAt)],
      columns: {
        id: true,
        content: true,
        fileAttachments: true,
        selectedPlatformSkillSlugs: true,
        status: true,
        createdAt: true,
      },
    });

    return rows
      .filter(
        (
          row,
        ): row is typeof row & {
          status: "queued" | "processing";
        } => row.status === "queued" || row.status === "processing",
      )
      .map((row) => ({
        id: row.id,
        content: row.content,
        fileAttachments: row.fileAttachments ?? undefined,
        selectedPlatformSkillSlugs: row.selectedPlatformSkillSlugs ?? undefined,
        status: row.status,
        createdAt: row.createdAt,
      }));
  }

  async removeConversationQueuedMessage(
    queuedMessageId: string,
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const deleted = await db
      .delete(conversationQueuedMessage)
      .where(
        and(
          eq(conversationQueuedMessage.id, queuedMessageId),
          eq(conversationQueuedMessage.conversationId, conversationId),
          eq(conversationQueuedMessage.userId, userId),
          inArray(conversationQueuedMessage.status, ["queued", "failed"]),
        ),
      )
      .returning({ id: conversationQueuedMessage.id });
    return deleted.length > 0;
  }

  async processConversationQueuedMessages(conversationId: string): Promise<void> {
    const conv = await db.query.conversation.findFirst({
      where: and(eq(conversation.id, conversationId), eq(conversation.type, "chat")),
      columns: {
        id: true,
      },
    });

    if (!conv) {
      return;
    }

    const active = await db.query.generation.findFirst({
      where: and(
        eq(generation.conversationId, conversationId),
        inArray(generation.status, ["running", "awaiting_approval", "awaiting_auth", "paused"]),
      ),
      columns: {
        id: true,
      },
    });

    if (active) {
      return;
    }

    const processNext = async (): Promise<void> => {
      const nextQueued = await db.query.conversationQueuedMessage.findFirst({
        where: and(
          eq(conversationQueuedMessage.conversationId, conversationId),
          eq(conversationQueuedMessage.status, "queued"),
        ),
        orderBy: [asc(conversationQueuedMessage.createdAt)],
        columns: {
          id: true,
        },
      });

      if (!nextQueued) {
        return;
      }

      const [claimed] = await db
        .update(conversationQueuedMessage)
        .set({
          status: "processing",
          processingStartedAt: new Date(),
          errorMessage: null,
        })
        .where(
          and(
            eq(conversationQueuedMessage.id, nextQueued.id),
            eq(conversationQueuedMessage.status, "queued"),
          ),
        )
        .returning({
          id: conversationQueuedMessage.id,
          userId: conversationQueuedMessage.userId,
          content: conversationQueuedMessage.content,
          fileAttachments: conversationQueuedMessage.fileAttachments,
          selectedPlatformSkillSlugs: conversationQueuedMessage.selectedPlatformSkillSlugs,
        });

      if (!claimed) {
        return processNext();
      }

      try {
        const started = await this.startGeneration({
          conversationId,
          userId: claimed.userId,
          content: claimed.content,
          fileAttachments: claimed.fileAttachments ?? undefined,
          selectedPlatformSkillSlugs: claimed.selectedPlatformSkillSlugs ?? undefined,
        });

        await db
          .update(conversationQueuedMessage)
          .set({
            status: "sent",
            generationId: started.generationId,
            sentAt: new Date(),
            processingStartedAt: null,
            errorMessage: null,
          })
          .where(eq(conversationQueuedMessage.id, claimed.id));
        return;
      } catch (error) {
        if (this.isActiveGenerationStartError(error)) {
          await db
            .update(conversationQueuedMessage)
            .set({
              status: "queued",
              processingStartedAt: null,
              errorMessage: null,
            })
            .where(eq(conversationQueuedMessage.id, claimed.id));
          return;
        }

        await db
          .update(conversationQueuedMessage)
          .set({
            status: "failed",
            processingStartedAt: null,
            errorMessage: formatErrorMessage(error),
          })
          .where(eq(conversationQueuedMessage.id, claimed.id));
        return processNext();
      }
    };

    await processNext();
  }

  getStreamCountersSnapshot(): {
    opened: number;
    closed: number;
    timedOut: number;
    deduped: number;
    active: number;
  } {
    let active = 0;
    for (const value of this.activeSubscriptionCounts.values()) {
      active += value;
    }
    return {
      ...this.streamCounters,
      active,
    };
  }

  private evictActiveGenerationContext(generationId: string): void {
    const ctx = this.activeGenerations.get(generationId);
    if (!ctx) {
      return;
    }

    if (ctx.saveDebounceId) {
      clearTimeout(ctx.saveDebounceId);
    }
    if (ctx.approvalTimeoutId) {
      clearTimeout(ctx.approvalTimeoutId);
    }
    if (ctx.authTimeoutId) {
      clearTimeout(ctx.authTimeoutId);
    }
    if (ctx.sandboxSlotLeaseRenewId) {
      clearInterval(ctx.sandboxSlotLeaseRenewId);
      ctx.sandboxSlotLeaseRenewId = undefined;
    }

    ctx.pendingMessageParts.clear();

    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Map.delete, not a Drizzle query
    this.activeGenerations.delete(generationId);
  }

  private pruneStalePendingMessageParts(ctx: GenerationContext): void {
    const now = Date.now();
    for (const [messageID, queued] of ctx.pendingMessageParts.entries()) {
      if (now - queued.firstQueuedAtMs > PENDING_MESSAGE_PARTS_TTL_MS) {
        // eslint-disable-next-line drizzle/enforce-delete-with-where -- Map.delete, not a Drizzle query
        ctx.pendingMessageParts.delete(messageID);
      }
    }
  }

  private getLockRedis(): IORedis {
    const globalForLocks = globalThis as typeof globalThis & {
      __cmdclawGenerationLockRedis?: IORedis;
    };
    if (!globalForLocks.__cmdclawGenerationLockRedis) {
      globalForLocks.__cmdclawGenerationLockRedis = new IORedis(
        buildRedisOptions(process.env.REDIS_URL ?? "redis://localhost:6379", {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        }),
      );
    }
    return globalForLocks.__cmdclawGenerationLockRedis;
  }

  private async acquireGenerationLease(generationId: string): Promise<string | null> {
    if (process.env.NODE_ENV === "test") {
      return `local-${generationId}`;
    }
    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL is required for durable generation lease locking.");
    }
    const token = crypto.randomUUID();
    const leaseKey = `locks:generation:${generationId}`;
    const result = await this.getLockRedis().set(leaseKey, token, "PX", 120_000, "NX");
    return result === "OK" ? token : null;
  }

  private async renewGenerationLease(generationId: string, token: string): Promise<void> {
    if (token.startsWith("local-")) {
      return;
    }
    const leaseKey = `locks:generation:${generationId}`;
    const owner = await this.getLockRedis().get(leaseKey);
    if (owner !== token) {
      return;
    }
    await this.getLockRedis().pexpire(leaseKey, 120_000);
  }

  private async releaseGenerationLease(generationId: string, token: string): Promise<void> {
    if (token.startsWith("local-")) {
      return;
    }
    const leaseKey = `locks:generation:${generationId}`;
    const owner = await this.getLockRedis().get(leaseKey);
    if (owner === token) {
      await this.getLockRedis().del(leaseKey);
    }
  }

  private async enqueueGenerationRun(
    generationId: string,
    type: "chat" | "coworker",
    options?: {
      delayMs?: number;
      dedupeKey?: string;
    },
  ): Promise<void> {
    const queue = getQueue();
    const jobName = type === "coworker" ? COWORKER_GENERATION_JOB_NAME : CHAT_GENERATION_JOB_NAME;
    await queue.add(
      jobName,
      { generationId },
      {
        jobId: buildQueueJobId([jobName, generationId, options?.dedupeKey]),
        ...(options?.delayMs && options.delayMs > 0 ? { delay: options.delayMs } : {}),
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
  }

  private getGenerationRunType(ctx: Pick<GenerationContext, "coworkerRunId">): "chat" | "coworker" {
    return ctx.coworkerRunId ? "coworker" : "chat";
  }

  private async touchConversationLastUserVisibleAction(conversationId: string): Promise<void> {
    await db
      .update(conversation)
      .set({ sandboxLastUserVisibleActionAt: new Date() })
      .where(eq(conversation.id, conversationId));
  }

  private async releaseSandboxSlotLease(ctx: GenerationContext): Promise<void> {
    if (ctx.sandboxSlotLeaseRenewId) {
      clearInterval(ctx.sandboxSlotLeaseRenewId);
      ctx.sandboxSlotLeaseRenewId = undefined;
    }
    if (!ctx.sandboxSlotLeaseToken) {
      return;
    }

    const token = ctx.sandboxSlotLeaseToken;
    ctx.sandboxSlotLeaseToken = undefined;
    await getSandboxSlotManager().releaseLease(ctx.id, token);
  }

  private async ensureSandboxSlotLease(
    ctx: GenerationContext,
    options?: {
      allowWorkerRequeue?: boolean;
    },
  ): Promise<"acquired" | "requeued" | "waiting"> {
    if (ctx.sandboxSlotLeaseToken) {
      return "acquired";
    }

    const acquired = await getSandboxSlotManager().acquireLease(ctx.id);
    if (acquired.granted) {
      ctx.sandboxSlotLeaseToken = acquired.token;
      ctx.sandboxSlotLeaseRenewId = setInterval(() => {
        if (!ctx.sandboxSlotLeaseToken) {
          return;
        }
        void getSandboxSlotManager().renewLease(ctx.id, ctx.sandboxSlotLeaseToken).catch((error) => {
          console.error(`[GenerationManager] Failed to renew sandbox slot for generation ${ctx.id}:`, error);
        });
      }, 30_000);
      return "acquired";
    }

    if ((options?.allowWorkerRequeue ?? false) && this.shouldDeferGenerationToWorker()) {
      await this.enqueueGenerationRun(ctx.id, this.getGenerationRunType(ctx), {
        delayMs: SANDBOX_SLOT_RETRY_DELAY_MS,
        dedupeKey: `slot-${Date.now()}`,
      });
      this.evictActiveGenerationContext(ctx.id);
      return "requeued";
    }

    return "waiting";
  }

  private async waitForSandboxSlotLease(
    ctx: GenerationContext,
    options?: {
      allowWorkerRequeue?: boolean;
    },
  ): Promise<"acquired" | "requeued"> {
    while (true) {
      const status = await this.ensureSandboxSlotLease(ctx, options);
      if (status === "acquired" || status === "requeued") {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, SANDBOX_SLOT_RETRY_DELAY_MS));
    }
  }

  private async enqueueGenerationTimeout(
    generationId: string,
    kind: GenerationTimeoutKind,
    expiresAtIso: string,
  ): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    const queue = getQueue();
    const runAt = Date.parse(expiresAtIso);
    const delay = Math.max(0, Number.isFinite(runAt) ? runAt - Date.now() : 0);
    const timeoutKey =
      Number.isFinite(runAt) && runAt > 0
        ? String(runAt)
        : expiresAtIso.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
    const jobName =
      kind === "approval" ? GENERATION_APPROVAL_TIMEOUT_JOB_NAME : GENERATION_AUTH_TIMEOUT_JOB_NAME;
    const jobId = buildQueueJobId([jobName, generationId, timeoutKey]);
    await queue.add(
      jobName,
      { generationId, kind, expiresAt: expiresAtIso },
      {
        jobId,
        delay,
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
  }

  private async enqueuePreparingStuckCheck(generationId: string): Promise<void> {
    try {
      const queue = getQueue();
      const jobName = GENERATION_PREPARING_STUCK_CHECK_JOB_NAME;
      await queue.add(
        jobName,
        { generationId },
        {
          jobId: buildQueueJobId([jobName, generationId]),
          delay: AGENT_PREPARING_TIMEOUT_MS,
          removeOnComplete: true,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      logServerEvent(
        "warn",
        "GENERATION_PREPARING_STUCK_CHECK_ENQUEUE_FAILED",
        {
          generationId,
          error: formatErrorMessage(error),
        },
        { source: "generation-manager" },
      );
    }
  }

  private getExecutionPolicyFromRecord(
    genRecord: typeof generation.$inferSelect,
    fallbackAutoApprove: boolean,
  ): {
    allowedIntegrations?: IntegrationType[];
    allowedCustomIntegrations?: string[];
    allowedSkillSlugs?: string[];
    autoApprove?: boolean;
    sandboxProvider?: "e2b" | "daytona" | "docker";
    selectedPlatformSkillSlugs?: string[];
    queuedFileAttachments?: UserFileAttachment[];
  } {
    const policy =
      (genRecord.executionPolicy as GenerationExecutionPolicy | null | undefined) ?? undefined;
    const allowedIntegrations = Array.isArray(policy?.allowedIntegrations)
      ? (policy.allowedIntegrations.filter(
          (entry): entry is IntegrationType => typeof entry === "string",
        ) as IntegrationType[])
      : undefined;
    return {
      allowedIntegrations,
      allowedCustomIntegrations: policy?.allowedCustomIntegrations,
      allowedSkillSlugs: normalizeCoworkerAllowedSkillSlugs(policy?.allowedSkillSlugs),
      autoApprove: policy?.autoApprove ?? fallbackAutoApprove,
      sandboxProvider:
        policy?.sandboxProvider === "e2b" ||
        policy?.sandboxProvider === "daytona" ||
        policy?.sandboxProvider === "docker"
          ? policy.sandboxProvider
          : undefined,
      selectedPlatformSkillSlugs: Array.isArray(policy?.selectedPlatformSkillSlugs)
        ? policy.selectedPlatformSkillSlugs.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : undefined,
      queuedFileAttachments: Array.isArray(policy?.queuedFileAttachments)
        ? policy.queuedFileAttachments.filter(
            (entry): entry is UserFileAttachment =>
              !!entry &&
              typeof entry === "object" &&
              typeof entry.name === "string" &&
              typeof entry.mimeType === "string" &&
              typeof entry.dataUrl === "string",
          )
        : undefined,
    };
  }

  private markPhase(ctx: GenerationContext, phase: string): void {
    const now = Date.now();
    const startedAtMs = ctx.startedAt.getTime();
    if (!ctx.phaseMarks) {
      ctx.phaseMarks = {};
    }
    if (!ctx.phaseTimeline) {
      ctx.phaseTimeline = [];
    }
    if (ctx.phaseMarks[phase] === undefined) {
      ctx.phaseMarks[phase] = now;
    }
    ctx.phaseTimeline.push({
      phase,
      atMs: now,
      elapsedMs: Math.max(0, now - startedAtMs),
    });
  }

  private async checkModelAccessForUser(params: {
    userId: string;
    model: string;
    authSource?: ProviderAuthSource | null;
  }): Promise<ModelAccessCheckResult> {
    const { providerID, modelID } = parseModelReference(params.model);

    if (providerID === "anthropic") {
      return { allowed: true };
    }

    if (providerID === "opencode") {
      const models = await listOpencodeFreeModels();
      if (models.some((model) => model.id === params.model)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "opencode_model_unavailable",
        userMessage:
          "Selected OpenCode model is no longer available. Choose another model and retry.",
      };
    }

    if (providerID === "openai") {
      const authSource = resolveModelAuthSource({
        model: params.model,
        authSource: params.authSource,
      });
      const hasAuth = await hasConnectedProviderAuthForUser(params.userId, "openai", authSource);
      if (!hasAuth) {
        return {
          allowed: false,
          reason: "openai_not_connected",
          userMessage:
            authSource === "shared"
              ? "This ChatGPT model requires the shared CmdClaw ChatGPT connection. Ask an admin to reconnect it, then retry."
              : "This ChatGPT model requires your connected ChatGPT account. Connect it in Settings > Connected AI Account, then retry.",
        };
      }
      const allowedIDs = new Set(getProviderModels("openai").map((model) => model.id));
      if (!allowedIDs.has(modelID)) {
        return {
          allowed: false,
          reason: "openai_model_not_allowed",
          userMessage:
            "Selected ChatGPT model is not available for your current connection. Choose another model and retry.",
        };
      }
      return { allowed: true };
    }

    if (providerID === "kimi-for-coding") {
      const hasAuth = await hasConnectedProviderAuthForUser(params.userId, "kimi");
      if (!hasAuth) {
        return {
          allowed: false,
          reason: "kimi_not_connected",
          userMessage:
            "This Kimi model requires a connected Kimi API key in Settings > Connected AI Account.",
        };
      }
      const allowedIDs = new Set(getProviderModels("kimi").map((model) => model.id));
      if (!allowedIDs.has(modelID)) {
        return {
          allowed: false,
          reason: "kimi_model_not_allowed",
          userMessage:
            "Selected Kimi model is not available for your current connection. Choose another model and retry.",
        };
      }
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "provider_not_supported",
      userMessage: `Selected model provider "${providerID}" is not supported in this environment.`,
    };
  }

  private buildMessageTiming(ctx: GenerationContext): MessageTiming {
    const generationCompletedAt = Date.now();
    const generationStartedAt = ctx.startedAt.getTime();
    const phaseMarks = ctx.phaseMarks ?? {};
    const phaseTimeline = ctx.phaseTimeline ?? [];
    const messageTiming: MessageTiming = {
      generationDurationMs: Math.max(0, generationCompletedAt - generationStartedAt),
    };
    const sandboxConnectStartMs =
      phaseMarks.agent_init_sandbox_checking_cache ?? phaseMarks.agent_init_started;
    const sandboxConnectEndMs =
      phaseMarks.agent_init_sandbox_reused ?? phaseMarks.agent_init_sandbox_created;
    const sandboxConnectOrCreateMs =
      sandboxConnectStartMs !== undefined && sandboxConnectEndMs !== undefined
        ? Math.max(0, sandboxConnectEndMs - sandboxConnectStartMs)
        : undefined;
    const opencodeReadyMs =
      phaseMarks.agent_init_opencode_starting !== undefined &&
      phaseMarks.agent_init_opencode_ready !== undefined
        ? Math.max(
            0,
            phaseMarks.agent_init_opencode_ready - phaseMarks.agent_init_opencode_starting,
          )
        : undefined;
    const sessionReadyMs =
      phaseMarks.agent_init_session_reused !== undefined && sandboxConnectEndMs !== undefined
        ? Math.max(0, phaseMarks.agent_init_session_reused - sandboxConnectEndMs)
        : phaseMarks.agent_init_session_creating !== undefined &&
            phaseMarks.agent_init_session_init_completed !== undefined
          ? Math.max(
              0,
              phaseMarks.agent_init_session_init_completed - phaseMarks.agent_init_session_creating,
            )
          : undefined;
    const legacySandboxStartupMs =
      ctx.agentInitStartedAt && ctx.agentSandboxReadyAt
        ? Math.max(0, ctx.agentSandboxReadyAt - ctx.agentInitStartedAt)
        : undefined;
    const resolvedSandboxStartupMs = sandboxConnectOrCreateMs ?? legacySandboxStartupMs;
    if (resolvedSandboxStartupMs !== undefined) {
      messageTiming.sandboxStartupDurationMs = resolvedSandboxStartupMs;
      messageTiming.sandboxStartupMode = ctx.agentSandboxMode ?? "unknown";
    }

    const agentInitMs =
      phaseMarks.agent_init_started !== undefined && phaseMarks.agent_init_ready !== undefined
        ? Math.max(0, phaseMarks.agent_init_ready - phaseMarks.agent_init_started)
        : undefined;
    const prePromptSetupMs =
      phaseMarks.pre_prompt_setup_started !== undefined && phaseMarks.prompt_sent !== undefined
        ? Math.max(0, phaseMarks.prompt_sent - phaseMarks.pre_prompt_setup_started)
        : undefined;
    const agentReadyToPromptMs =
      phaseMarks.agent_init_ready !== undefined && phaseMarks.prompt_sent !== undefined
        ? Math.max(0, phaseMarks.prompt_sent - phaseMarks.agent_init_ready)
        : undefined;
    const waitForFirstEventMs =
      phaseMarks.prompt_sent !== undefined && phaseMarks.first_event_received !== undefined
        ? Math.max(0, phaseMarks.first_event_received - phaseMarks.prompt_sent)
        : undefined;
    const firstTokenAtMs = phaseMarks.first_token_emitted;
    const firstVisibleOutputAtMs =
      phaseMarks.first_visible_output_emitted ?? phaseMarks.first_token_emitted;
    const promptToFirstTokenMs =
      phaseMarks.prompt_sent !== undefined && firstTokenAtMs !== undefined
        ? Math.max(0, firstTokenAtMs - phaseMarks.prompt_sent)
        : undefined;
    const generationToFirstTokenMs =
      phaseMarks.generation_started !== undefined && firstTokenAtMs !== undefined
        ? Math.max(0, firstTokenAtMs - phaseMarks.generation_started)
        : undefined;
    const promptToFirstVisibleOutputMs =
      phaseMarks.prompt_sent !== undefined && firstVisibleOutputAtMs !== undefined
        ? Math.max(0, firstVisibleOutputAtMs - phaseMarks.prompt_sent)
        : undefined;
    const generationToFirstVisibleOutputMs =
      phaseMarks.generation_started !== undefined && firstVisibleOutputAtMs !== undefined
        ? Math.max(0, firstVisibleOutputAtMs - phaseMarks.generation_started)
        : undefined;
    const streamFinishedAt = phaseMarks.session_idle ?? phaseMarks.prompt_completed;
    const modelStreamMs =
      phaseMarks.first_event_received !== undefined && streamFinishedAt !== undefined
        ? Math.max(0, streamFinishedAt - phaseMarks.first_event_received)
        : undefined;
    const postProcessingMs =
      phaseMarks.post_processing_started !== undefined &&
      phaseMarks.post_processing_completed !== undefined
        ? Math.max(0, phaseMarks.post_processing_completed - phaseMarks.post_processing_started)
        : undefined;

    const phaseDurationsMs = {
      sandboxConnectOrCreateMs,
      opencodeReadyMs,
      sessionReadyMs,
      agentInitMs,
      prePromptSetupMs,
      agentReadyToPromptMs,
      waitForFirstEventMs,
      promptToFirstTokenMs,
      generationToFirstTokenMs,
      promptToFirstVisibleOutputMs,
      generationToFirstVisibleOutputMs,
      modelStreamMs,
      postProcessingMs,
    };
    if (Object.values(phaseDurationsMs).some((value) => value !== undefined)) {
      messageTiming.phaseDurationsMs = phaseDurationsMs;
    }

    if (phaseTimeline.length > 0) {
      messageTiming.phaseTimestamps = phaseTimeline.map((entry) => ({
        phase: entry.phase,
        at: new Date(entry.atMs).toISOString(),
        elapsedMs: entry.elapsedMs,
      }));
    }

    return messageTiming;
  }

  /**
   * Start a new generation for a conversation
   */
  async startGeneration(params: {
    conversationId?: string;
    content: string;
    model?: string;
    authSource?: ProviderAuthSource | null;
    userId: string;
    autoApprove?: boolean;
    sandboxProvider?: "e2b" | "daytona" | "docker";
    allowedIntegrations?: IntegrationType[];
    fileAttachments?: UserFileAttachment[];
    selectedPlatformSkillSlugs?: string[];
  }): Promise<{ generationId: string; conversationId: string }> {
    const { content, userId, model, autoApprove } = params;
    const fileAttachments = params.fileAttachments;
    const requestedModel = model?.trim();
    if (requestedModel) {
      parseModelReference(requestedModel);
    }
    const requestedAuthSource = requestedModel
      ? resolveModelAuthSource({
          model: requestedModel,
          authSource: params.authSource,
        })
      : null;
    const traceId = createTraceId();
    const startGenerationStartedAt = Date.now();
    const logContext = {
      source: "generation-manager",
      traceId,
      userId,
      conversationId: params.conversationId,
    };
    logServerEvent(
      "info",
      "START_GENERATION_REQUESTED",
      {
        hasConversationId: Boolean(params.conversationId),
        requestedModel: requestedModel ?? null,
        hasAllowedIntegrations: params.allowedIntegrations !== undefined,
        sandboxProviderOverride: params.sandboxProvider ?? null,
        fileAttachmentsCount: fileAttachments?.length ?? 0,
        selectedPlatformSkillCount: params.selectedPlatformSkillSlugs?.length ?? 0,
      },
      logContext,
    );

    if (params.conversationId) {
      // Cross-instance guard (DB is source of truth).
      const existing = await db.query.generation.findFirst({
        where: and(
          eq(generation.conversationId, params.conversationId),
          inArray(generation.status, ["running", "awaiting_approval", "awaiting_auth", "paused"]),
        ),
        columns: {
          id: true,
          status: true,
        },
      });
      if (existing) {
        throw new Error(
          `Generation already in progress for this conversation (${existing.id}, status=${existing.status})`,
        );
      }
    }
    logServerEvent(
      "info",
      "START_GENERATION_PHASE_DONE",
      {
        phase: "active_generation_check",
        elapsedMs: Date.now() - startGenerationStartedAt,
      },
      logContext,
    );

    // Get or create conversation
    let conv: typeof conversation.$inferSelect;
    let isNewConversation = false;

    if (params.conversationId) {
      const existing = await db.query.conversation.findFirst({
        where: eq(conversation.id, params.conversationId),
      });
      if (!existing) {
        throw new Error("Conversation not found");
      }
      if (existing.userId !== userId) {
        throw new Error("Access denied");
      }
      conv = existing;
    } else {
      isNewConversation = true;
      const resolvedModel = requestedModel ?? DEFAULT_MODEL_REFERENCE;
      const resolvedAuthSource = resolveModelAuthSource({
        model: resolvedModel,
        authSource: requestedAuthSource,
      });
      const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      const dbUser =
        "user" in db.query
          ? await db.query.user.findFirst({
              where: eq(user.id, userId),
              columns: {
                activeWorkspaceId: true,
              },
            })
          : null;
      const [newConv] = await db
        .insert(conversation)
        .values({
          userId,
          workspaceId: dbUser?.activeWorkspaceId ?? null,
          title,
          type: "chat",
          model: resolvedModel,
          authSource: resolvedAuthSource,
          autoApprove: false,
        })
        .returning();
      conv = newConv;
    }
    const resolvedModel = requestedModel ?? conv.model ?? DEFAULT_MODEL_REFERENCE;
    const resolvedAuthSource = resolveModelAuthSource({
      model: resolvedModel,
      authSource: requestedAuthSource ?? conv.authSource,
    });
    if (requestedModel || conv.authSource !== resolvedAuthSource) {
      const [updatedConv] = await db
        .update(conversation)
        .set({
          model: resolvedModel,
          authSource: resolvedAuthSource,
        })
        .where(eq(conversation.id, conv.id))
        .returning();
      if (updatedConv) {
        conv = updatedConv;
      }
    }
    const accessCheck = await this.checkModelAccessForUser({
      userId,
      model: resolvedModel,
      authSource: resolvedAuthSource,
    });
    if (!accessCheck.allowed) {
      logServerEvent(
        "warn",
        "START_GENERATION_MODEL_ACCESS_DENIED",
        {
          requestedModel: requestedModel ?? null,
          resolvedModel,
          reason: accessCheck.reason,
        },
        { ...logContext, conversationId: conv.id },
      );
      throw new Error(accessCheck.userMessage);
    }
    logServerEvent(
      "info",
      "START_GENERATION_PHASE_DONE",
      {
        phase: "model_access_validated",
        elapsedMs: Date.now() - startGenerationStartedAt,
        resolvedModel,
        resolvedAuthSource,
      },
      { ...logContext, conversationId: conv.id },
    );
    logServerEvent(
      "info",
      "START_GENERATION_PHASE_DONE",
      {
        phase: "conversation_ready",
        elapsedMs: Date.now() - startGenerationStartedAt,
        resolvedConversationId: conv.id,
        isNewConversation,
      },
      { ...logContext, conversationId: conv.id },
    );

    const selectedPlatformSkillSlugs = await resolveSelectedPlatformSkillSlugs(
      params.selectedPlatformSkillSlugs,
    );
    let builderCoworkerContext =
      conv.type === "coworker"
        ? await resolveCoworkerBuilderContextByConversation({
            database: db,
            userId,
            conversationId: conv.id,
          })
        : null;

    // Save user message
    const [userMsg] = await db
      .insert(message)
      .values({
        conversationId: conv.id,
        role: "user",
        content,
      })
      .returning();

    if (builderCoworkerContext) {
      const coworkerMetadataRow = await db.query.coworker.findFirst({
        where: and(eq(coworker.id, builderCoworkerContext.coworkerId), eq(coworker.ownerId, userId)),
        columns: {
          id: true,
          name: true,
          description: true,
          username: true,
          prompt: true,
          triggerType: true,
          allowedIntegrations: true,
          allowedCustomIntegrations: true,
          schedule: true,
          autoApprove: true,
          promptDo: true,
          promptDont: true,
        },
      });

      if (coworkerMetadataRow) {
        const metadataUpdates = await generateCoworkerMetadataOnFirstPromptFill({
          database: db,
          current: coworkerMetadataRow,
          next: {
            ...coworkerMetadataRow,
            prompt: content,
          },
        });
        const persistedMetadataUpdates = Object.fromEntries(
          Object.entries(metadataUpdates).filter((entry): entry is [string, string] =>
            typeof entry[1] === "string",
          ),
        );

        if (Object.keys(persistedMetadataUpdates).length > 0) {
          await db
            .update(coworker)
            .set(persistedMetadataUpdates)
            .where(eq(coworker.id, builderCoworkerContext.coworkerId));

          builderCoworkerContext =
            (await resolveCoworkerBuilderContextByConversation({
              database: db,
              userId,
              conversationId: conv.id,
            })) ?? builderCoworkerContext;
        }
      }
    }

    logServerEvent(
      "info",
      "START_GENERATION_PHASE_DONE",
      {
        phase: "message_saved",
        elapsedMs: Date.now() - startGenerationStartedAt,
        messageId: userMsg.id,
      },
      { ...logContext, conversationId: conv.id },
    );

    // Upload user file attachments to S3 and save metadata
    if (fileAttachments && fileAttachments.length > 0) {
      try {
        await this.persistMessageAttachments({
          conversationId: conv.id,
          messageId: userMsg.id,
          attachments: fileAttachments,
        });
        logServerEvent(
          "info",
          "START_GENERATION_PHASE_DONE",
          {
            phase: "attachments_uploaded",
            elapsedMs: Date.now() - startGenerationStartedAt,
            fileAttachmentsCount: fileAttachments.length,
          },
          { ...logContext, conversationId: conv.id },
        );
      } catch (err) {
        logServerEvent(
          "error",
          "START_GENERATION_ATTACHMENTS_UPLOAD_FAILED",
          {
            elapsedMs: Date.now() - startGenerationStartedAt,
            error: formatErrorMessage(err),
          },
          { ...logContext, conversationId: conv.id },
        );
      }
    }

    // Create generation record
    const runtimeCallbackToken = crypto.randomUUID();
    const [genRecord] = await db
      .insert(generation)
      .values({
        conversationId: conv.id,
        status: "running",
        executionPolicy: buildExecutionPolicy({
          allowedIntegrations: params.allowedIntegrations,
          autoApprove: autoApprove ?? conv.autoApprove,
          sandboxProvider: params.sandboxProvider,
          selectedPlatformSkillSlugs,
          queuedFileAttachments: fileAttachments,
        }),
        runtimeCallbackToken,
        contentParts: [],
        inputTokens: 0,
        outputTokens: 0,
      })
      .returning();
    logServerEvent(
      "info",
      "START_GENERATION_PHASE_DONE",
      {
        phase: "generation_record_created",
        elapsedMs: Date.now() - startGenerationStartedAt,
        generationId: genRecord.id,
      },
      { ...logContext, conversationId: conv.id, generationId: genRecord.id },
    );

    // Update conversation status
    await db
      .update(conversation)
      .set({
        generationStatus: "generating",
        currentGenerationId: genRecord.id,
        sandboxLastUserVisibleActionAt: new Date(),
      })
      .where(eq(conversation.id, conv.id));
    await this.enqueuePreparingStuckCheck(genRecord.id);
    logServerEvent(
      "info",
      "START_GENERATION_PHASE_DONE",
      {
        phase: "conversation_status_updated",
        elapsedMs: Date.now() - startGenerationStartedAt,
      },
      { ...logContext, conversationId: conv.id, generationId: genRecord.id },
    );

    const backendType: BackendType = "opencode";

    if (this.shouldDeferGenerationToWorker()) {
      await this.enqueueGenerationRun(genRecord.id, "chat");
      logServerEvent(
        "info",
        "GENERATION_ENQUEUED",
        {
          backendType,
          delivery: "queue",
          enqueuedAttachmentsCount: fileAttachments?.length ?? 0,
        },
        {
          source: "generation-manager",
          traceId,
          generationId: genRecord.id,
          conversationId: conv.id,
          userId,
        },
      );
      return {
        generationId: genRecord.id,
        conversationId: conv.id,
      };
    }

    // Create generation context
    const ctx: GenerationContext = {
      id: genRecord.id,
      traceId,
      conversationId: conv.id,
      userId,
      status: "running",
      contentParts: [],
      assistantContent: "",
      abortController: new AbortController(),
      pendingApproval: null,
      pendingAuth: null,
      usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      startedAt: new Date(),
      lastSaveAt: new Date(),
      isNewConversation,
      model: requestedModel ?? conv.model ?? DEFAULT_MODEL_REFERENCE,
      authSource: resolveModelAuthSource({
        model: requestedModel ?? conv.model ?? DEFAULT_MODEL_REFERENCE,
        authSource: requestedAuthSource ?? conv.authSource,
      }),
      userMessageContent: content,
      assistantMessageIds: new Set(),
      messageRoles: new Map(),
      pendingMessageParts: new Map(),
      backendType,
      sandboxProviderOverride: params.sandboxProvider,
      allowedIntegrations: params.allowedIntegrations,
      autoApprove: autoApprove ?? conv.autoApprove,
      attachments: fileAttachments,
      builderCoworkerContext,
      selectedPlatformSkillSlugs,
      userStagedFilePaths: new Set(),
      uploadedSandboxFileIds: new Set(),
      runtimeCallbackToken,
      agentInitStartedAt: undefined,
      agentInitReadyAt: undefined,
      agentInitFailedAt: undefined,
      phaseMarks: {},
      phaseTimeline: [],
      streamSequence: 0,
      streamPublishedCount: 0,
      streamDeliveredCount: 0,
    };

    this.activeGenerations.set(genRecord.id, ctx);
    this.markPhase(ctx, "generation_started");

    logServerEvent(
      "info",
      "GENERATION_ENQUEUED",
      { backendType, delivery: "in_process" },
      {
        source: "generation-manager",
        traceId: ctx.traceId,
        generationId: ctx.id,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
      },
    );
    logServerEvent(
      "info",
      "START_GENERATION_RETURNING",
      {
        elapsedMs: Date.now() - startGenerationStartedAt,
        generationId: ctx.id,
      },
      {
        source: "generation-manager",
        traceId: ctx.traceId,
        generationId: ctx.id,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
      },
    );

    // Start the generation in the background
    this.runGeneration(ctx).catch((err) => {
      console.error("[GenerationManager] runGeneration error:", err);
    });

    return {
      generationId: genRecord.id,
      conversationId: conv.id,
    };
  }

  /**
   * Start a new coworker generation.
   */
  async startCoworkerGeneration(params: {
    coworkerRunId: string;
    content: string;
    model?: string;
    authSource?: ProviderAuthSource | null;
    userId: string;
    autoApprove: boolean;
    sandboxProvider?: "e2b" | "daytona" | "docker";
    allowedIntegrations: IntegrationType[];
    allowedCustomIntegrations?: string[];
    allowedSkillSlugs?: string[];
    fileAttachments?: UserFileAttachment[];
  }): Promise<{ generationId: string; conversationId: string }> {
    const { content, userId, model } = params;
    const resolvedModel = await resolveCoworkerModel(model);
    const resolvedAuthSource = resolveModelAuthSource({
      model: resolvedModel,
      authSource: params.authSource,
    });
    const accessCheck = await this.checkModelAccessForUser({
      userId,
      model: resolvedModel,
      authSource: resolvedAuthSource,
    });
    if (!accessCheck.allowed) {
      throw new Error(accessCheck.userMessage);
    }
    const normalizedAllowedSkillSlugs = normalizeCoworkerAllowedSkillSlugs(params.allowedSkillSlugs);
    const { platformSkillSlugs } = splitCoworkerAllowedSkillSlugs(normalizedAllowedSkillSlugs);
    const selectedPlatformSkillSlugs = await resolveSelectedPlatformSkillSlugs(platformSkillSlugs);

    const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
    const [newConv] = await db
      .insert(conversation)
      .values({
        userId,
        title: title || "Coworker run",
        type: "coworker",
        model: resolvedModel,
        authSource: resolvedAuthSource,
        autoApprove: params.autoApprove,
      })
      .returning();

    const [userMessage] = await db
      .insert(message)
      .values({
        conversationId: newConv.id,
        role: "user",
        content,
      })
      .returning({ id: message.id });

    if (!userMessage?.id) {
      throw new Error("Failed to create coworker user message");
    }

    if (params.fileAttachments && params.fileAttachments.length > 0) {
      await this.persistMessageAttachments({
        conversationId: newConv.id,
        messageId: userMessage.id,
        attachments: params.fileAttachments,
      });
    }

    const [genRecord] = await db
      .insert(generation)
      .values({
        conversationId: newConv.id,
        status: "running",
        executionPolicy: buildExecutionPolicy({
          allowedIntegrations: params.allowedIntegrations,
          allowedCustomIntegrations: params.allowedCustomIntegrations,
          allowedSkillSlugs: normalizedAllowedSkillSlugs,
          autoApprove: params.autoApprove,
          sandboxProvider: params.sandboxProvider,
          selectedPlatformSkillSlugs,
          queuedFileAttachments: params.fileAttachments,
        }),
        contentParts: [],
        inputTokens: 0,
        outputTokens: 0,
      })
      .returning();

    await db
      .update(conversation)
      .set({
        generationStatus: "generating",
        currentGenerationId: genRecord.id,
        sandboxLastUserVisibleActionAt: new Date(),
      })
      .where(eq(conversation.id, newConv.id));

    if (this.shouldDeferGenerationToWorker()) {
      await this.enqueueGenerationRun(genRecord.id, "coworker");
      logServerEvent(
        "info",
        "COWORKER_GENERATION_ENQUEUED",
        { delivery: "queue" },
        {
          source: "generation-manager",
          traceId: createTraceId(),
          generationId: genRecord.id,
          conversationId: newConv.id,
          userId,
        },
      );
      return {
        generationId: genRecord.id,
        conversationId: newConv.id,
      };
    }

    const ctx: GenerationContext = {
      id: genRecord.id,
      traceId: createTraceId(),
      conversationId: newConv.id,
      userId,
      status: "running",
      contentParts: [],
      assistantContent: "",
      abortController: new AbortController(),
      pendingApproval: null,
      pendingAuth: null,
      usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      startedAt: new Date(),
      lastSaveAt: new Date(),
      isNewConversation: true,
      model: resolvedModel,
      authSource: resolvedAuthSource,
      userMessageContent: content,
      attachments: params.fileAttachments,
      assistantMessageIds: new Set(),
      messageRoles: new Map(),
      pendingMessageParts: new Map(),
      backendType: "opencode",
      sandboxProviderOverride: params.sandboxProvider,
      coworkerRunId: params.coworkerRunId,
      allowedIntegrations: params.allowedIntegrations,
      autoApprove: params.autoApprove,
      allowedCustomIntegrations: params.allowedCustomIntegrations,
      allowedSkillSlugs: normalizedAllowedSkillSlugs,
      coworkerPrompt: undefined,
      coworkerPromptDo: undefined,
      coworkerPromptDont: undefined,
      triggerPayload: undefined,
      builderCoworkerContext: null,
      selectedPlatformSkillSlugs,
      userStagedFilePaths: new Set(),
      uploadedSandboxFileIds: new Set(),
      agentInitStartedAt: undefined,
      agentInitReadyAt: undefined,
      agentInitFailedAt: undefined,
      phaseMarks: {},
      phaseTimeline: [],
      streamSequence: 0,
      streamPublishedCount: 0,
      streamDeliveredCount: 0,
    };

    this.activeGenerations.set(genRecord.id, ctx);
    this.markPhase(ctx, "generation_started");

    logServerEvent(
      "info",
      "COWORKER_GENERATION_ENQUEUED",
      {},
      {
        source: "generation-manager",
        traceId: ctx.traceId,
        generationId: ctx.id,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
      },
    );

    this.runGeneration(ctx).catch((err) => {
      console.error("[GenerationManager] runGeneration error:", err);
    });

    return {
      generationId: genRecord.id,
      conversationId: newConv.id,
    };
  }

  async runQueuedGeneration(generationId: string): Promise<void> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });
    if (!genRecord) {
      return;
    }
    if (
      genRecord.status === "completed" ||
      genRecord.status === "cancelled" ||
      genRecord.status === "error"
    ) {
      return;
    }
    if (!genRecord.conversation.userId) {
      return;
    }

    const latestUserMessage = await db.query.message.findFirst({
      where: and(eq(message.conversationId, genRecord.conversationId), eq(message.role, "user")),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      columns: { content: true },
    });
    const linkedCoworkerRun = await db.query.coworkerRun.findFirst({
      where: eq(coworkerRun.generationId, generationId),
      columns: { id: true, coworkerId: true, triggerPayload: true },
    });
    const linkedCoworker = linkedCoworkerRun
      ? await db.query.coworker.findFirst({
          where: eq(coworker.id, linkedCoworkerRun.coworkerId),
          columns: {
            allowedIntegrations: true,
            allowedCustomIntegrations: true,
            allowedSkillSlugs: true,
            prompt: true,
            promptDo: true,
            promptDont: true,
            autoApprove: true,
          },
        })
      : null;
    const executionPolicy = this.getExecutionPolicyFromRecord(
      genRecord,
      linkedCoworker?.autoApprove ?? genRecord.conversation.autoApprove,
    );
    const linkedCoworkerAllowedSkillSlugs = normalizeCoworkerAllowedSkillSlugs(
      linkedCoworker?.allowedSkillSlugs,
    );
    const linkedCoworkerPlatformSkillSlugs = linkedCoworkerAllowedSkillSlugs.filter(
      (entry) => !entry.startsWith(CUSTOM_SKILL_PREFIX),
    );
    const builderCoworkerContext =
      genRecord.conversation.type === "coworker"
        ? await resolveCoworkerBuilderContextByConversation({
            database: db,
            userId: genRecord.conversation.userId,
            conversationId: genRecord.conversationId,
          })
        : null;
    const pendingInterrupt = await generationInterruptService.getPendingInterruptForGeneration(
      generationId,
    );

    const ctx: GenerationContext = {
      id: genRecord.id,
      traceId: createTraceId(),
      conversationId: genRecord.conversationId,
      userId: genRecord.conversation.userId,
      status: genRecord.status,
      contentParts: (genRecord.contentParts as ContentPart[] | null) ?? [],
      assistantContent: "",
      abortController: new AbortController(),
      pendingApproval: null,
      pendingAuth: null,
      usage: {
        inputTokens: genRecord.inputTokens,
        outputTokens: genRecord.outputTokens,
        totalCostUsd: 0,
      },
      startedAt: genRecord.startedAt,
      lastSaveAt: new Date(),
      isNewConversation: false,
      model: genRecord.conversation.model ?? DEFAULT_MODEL_REFERENCE,
      authSource: resolveModelAuthSource({
        model: genRecord.conversation.model ?? DEFAULT_MODEL_REFERENCE,
        authSource: genRecord.conversation.authSource,
      }),
      userMessageContent: latestUserMessage?.content ?? "",
      attachments: executionPolicy.queuedFileAttachments,
      assistantMessageIds: new Set(),
      messageRoles: new Map(),
      pendingMessageParts: new Map(),
      backendType: "opencode",
      sandboxProviderOverride: executionPolicy.sandboxProvider,
      coworkerRunId: linkedCoworkerRun?.id,
      allowedIntegrations:
        executionPolicy.allowedIntegrations ??
        (linkedCoworker?.allowedIntegrations as IntegrationType[] | null | undefined) ??
        undefined,
      autoApprove:
        executionPolicy.autoApprove ??
        linkedCoworker?.autoApprove ??
        genRecord.conversation.autoApprove,
      allowedCustomIntegrations:
        executionPolicy.allowedCustomIntegrations ??
        linkedCoworker?.allowedCustomIntegrations ??
        undefined,
      allowedSkillSlugs:
        executionPolicy.allowedSkillSlugs ??
        linkedCoworkerAllowedSkillSlugs ??
        undefined,
      coworkerPrompt: undefined,
      coworkerPromptDo: undefined,
      coworkerPromptDont: undefined,
      triggerPayload: undefined,
      builderCoworkerContext,
      selectedPlatformSkillSlugs:
        executionPolicy.selectedPlatformSkillSlugs ??
        (linkedCoworkerPlatformSkillSlugs.length > 0 ? linkedCoworkerPlatformSkillSlugs : undefined),
      userStagedFilePaths: new Set(),
      uploadedSandboxFileIds: new Set(),
      runtimeCallbackToken: genRecord.runtimeCallbackToken ?? undefined,
      agentInitStartedAt: undefined,
      agentInitReadyAt: undefined,
      agentInitFailedAt: undefined,
      phaseMarks: {},
      phaseTimeline: [],
      streamSequence: 0,
      streamPublishedCount: 0,
      streamDeliveredCount: 0,
    };
    ctx.currentInterruptId = pendingInterrupt?.id;

    logServerEvent(
      "info",
      "QUEUED_GENERATION_CONTEXT_REHYDRATED",
      {
        rehydratedAttachmentsCount: ctx.attachments?.length ?? 0,
      },
      {
        source: "generation-manager",
        traceId: ctx.traceId,
        generationId: ctx.id,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
      },
    );

    this.activeGenerations.set(genRecord.id, ctx);
    this.markPhase(ctx, "generation_started");
    if (ctx.status === "awaiting_approval" && pendingInterrupt?.expiresAt) {
      await this.enqueueGenerationTimeout(ctx.id, "approval", pendingInterrupt.expiresAt.toISOString());
    }
    if (ctx.status === "awaiting_auth" && pendingInterrupt?.expiresAt) {
      await this.enqueueGenerationTimeout(ctx.id, "auth", pendingInterrupt.expiresAt.toISOString());
    }
    if (
      ctx.status === "awaiting_approval" &&
      pendingInterrupt &&
      Date.now() >=
        resolveExpiryMs(
          pendingInterrupt.expiresAt?.toISOString(),
          pendingInterrupt.requestedAt.toISOString(),
          APPROVAL_TIMEOUT_MS,
        )
    ) {
      await this.processGenerationTimeout(ctx.id, "approval");
      return;
    }
    if (
      ctx.status === "awaiting_auth" &&
      pendingInterrupt &&
      Date.now() >=
        resolveExpiryMs(
          pendingInterrupt.expiresAt?.toISOString(),
          pendingInterrupt.requestedAt.toISOString(),
          AUTH_TIMEOUT_MS,
        )
    ) {
      await this.processGenerationTimeout(ctx.id, "auth");
      return;
    }

    if (ctx.status === "awaiting_approval" && pendingInterrupt?.provider === "opencode") {
      const decision = await this.waitForOpenCodeApprovalDecision(pendingInterrupt.id);
      if (!decision) {
        await this.handleApprovalTimeout(ctx);
        return;
      }
      await this.applyOpenCodeApprovalDecision(
        ctx,
        pendingInterrupt.id,
        decision.decision,
        decision.questionAnswers,
      );
      await this.runGeneration(ctx);
      return;
    }

    await this.runGeneration(ctx);
  }

  /**
   * Subscribe to a generation's events
   */
  async *subscribeToGeneration(
    generationId: string,
    userId: string,
    options?: { cursor?: string },
  ): AsyncGenerator<GenerationStreamEvent, void, unknown> {
    const initial = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });
    if (!initial) {
      yield { type: "error", message: "Generation not found" };
      return;
    }
    if (initial.conversation.userId !== userId) {
      yield { type: "error", message: "Access denied" };
      return;
    }

    const subscriptionKey = this.getSubscriptionKey(generationId, userId);
    const existingSubscriptionCount = this.activeSubscriptionCounts.get(subscriptionKey) ?? 0;
    if (existingSubscriptionCount > 0) {
      this.streamCounters.deduped += 1;
      logServerEvent(
        "info",
        "GENERATION_STREAM_DUPLICATE_DETECTED",
        {
          ...this.getStreamCountersSnapshot(),
          existingSubscriptionCount,
        },
        {
          source: "generation-manager",
          generationId: initial.id,
          conversationId: initial.conversationId,
          userId,
        },
      );
    }

    this.activeSubscriptionCounts.set(subscriptionKey, existingSubscriptionCount + 1);
    this.streamCounters.opened += 1;

    const maxWaitMs =
      initial.conversation.type === "coworker"
        ? Math.max(10 * 60 * 1000, GEN_STREAM_SUBSCRIBE_MAX_WAIT_MS)
        : GEN_STREAM_SUBSCRIBE_MAX_WAIT_MS;
    const startedAt = Date.now();
    const streamId = createTraceId();
    let terminated = false;
    let terminatedBy:
      | "completed"
      | "cancelled"
      | "error"
      | "not_found"
      | "access_denied"
      | "redis_unavailable"
      | "timeout"
      | null = null;
    let eventsYielded = 0;
    let redisReadCount = 0;
    let redisEmptyReadCount = 0;
    let lastDbRecoveryCheckAt = 0;
    let cursor = options?.cursor ?? "0-0";
    let observedParts: ContentPart[] = [];
    let lastStatus: typeof generation.$inferSelect.status | null = null;
    let emittedPendingInterruptId: string | null = null;
    const isTestRuntime = process.env.NODE_ENV === "test";
    let testLoopIterations = 0;

    try {
      while (!terminated && Date.now() - startedAt < maxWaitMs) {
        if (isTestRuntime) {
          testLoopIterations += 1;
          if (testLoopIterations > 2_000) {
            terminated = true;
            terminatedBy = "timeout";
            eventsYielded += 1;
            yield {
              type: "error",
              message: "Generation stream exceeded test loop budget without terminal state.",
            };
            break;
          }
          // eslint-disable-next-line no-await-in-loop -- cooperative scheduling for fake-timer test runs
          await Promise.resolve();
        }

        let events: Awaited<ReturnType<typeof readGenerationStreamAfter>> = [];
        if (isTestRuntime) {
          events = [];
        } else {
          try {
            // eslint-disable-next-line no-await-in-loop -- blocking stream consumption is intentional
            events = await readGenerationStreamAfter({
              generationId,
              cursor,
            });
            redisReadCount += 1;
          } catch (error) {
            terminatedBy = "redis_unavailable";
            logServerEvent(
              "error",
              "GENERATION_STREAM_REDIS_READ_FAILED",
              {
                error: formatErrorMessage(error),
                streamId,
                cursor,
                redisReadCount,
              },
              {
                source: "generation-manager",
                generationId: initial.id,
                conversationId: initial.conversationId,
                userId,
              },
            );
            eventsYielded += 1;
            yield {
              type: "error",
              message: "Generation stream is temporarily unavailable. Please retry in a moment.",
            };
            terminated = true;
            break;
          }
        }

        if (events.length === 0) {
          redisEmptyReadCount += 1;
          const now = Date.now();
          if (isTestRuntime || now - lastDbRecoveryCheckAt >= GEN_STREAM_DB_RECOVERY_POLL_MS) {
            lastDbRecoveryCheckAt = now;
            // eslint-disable-next-line no-await-in-loop -- recovery check is intentionally sequential
            const latest = await db.query.generation.findFirst({
              where: eq(generation.id, generationId),
              with: { conversation: true },
            });
            if (!latest) {
              terminated = true;
              terminatedBy = "not_found";
              eventsYielded += 1;
              yield { type: "error", message: "Generation not found" };
              break;
            }
            if (latest.conversation.userId !== userId) {
              terminated = true;
              terminatedBy = "access_denied";
              eventsYielded += 1;
              yield { type: "error", message: "Access denied" };
              break;
            }

            const streamPresent = isTestRuntime
              ? false
              : // eslint-disable-next-line no-await-in-loop -- recovery check is intentionally sequential
                await generationStreamExists(generationId);
            if (!streamPresent) {
              const latestParts = (latest.contentParts ?? []) as ContentPart[];
              const sharedLength = Math.min(observedParts.length, latestParts.length);
              for (let i = 0; i < sharedLength; i += 1) {
                const previousPart = observedParts[i];
                const currentPart = latestParts[i];
                if (
                  previousPart.type === "text" &&
                  currentPart.type === "text" &&
                  currentPart.text.length > previousPart.text.length
                ) {
                  eventsYielded += 1;
                  yield {
                    type: "text",
                    content: currentPart.text.slice(previousPart.text.length),
                  };
                }
              }
              for (let i = observedParts.length; i < latestParts.length; i += 1) {
                const partEvent = this.emitReplayPartEvent(
                  latest.id,
                  latest.conversationId,
                  latestParts[i],
                  latestParts,
                );
                if (partEvent) {
                  eventsYielded += 1;
                  yield partEvent;
                }
              }
              observedParts = latestParts;

              if (latest.status !== lastStatus) {
                lastStatus = latest.status;
                eventsYielded += 1;
                yield { type: "status_change", status: latest.status };
              }

              const pendingInterrupt =
                latest.status === "awaiting_approval" || latest.status === "awaiting_auth"
                  ? await generationInterruptService.getPendingInterruptForGeneration(latest.id)
                  : null;
              if (pendingInterrupt && emittedPendingInterruptId !== pendingInterrupt.id) {
                emittedPendingInterruptId = pendingInterrupt.id;
                eventsYielded += 1;
                yield this.projectInterruptPendingEvent(pendingInterrupt);
              }
            }

            if (
              !streamPresent &&
              (latest.status === "completed" ||
                latest.status === "cancelled" ||
                latest.status === "error")
            ) {
              // eslint-disable-next-line no-await-in-loop -- terminal recovery is intentionally sequential
              const terminalEvent = await this.getTerminalRecoveryEvent(latest, {
                includeCursor: !isTestRuntime,
              });
              if (terminalEvent) {
                terminated = true;
                terminatedBy = latest.status;
                eventsYielded += 1;
                yield terminalEvent;
                break;
              }
            }
          }
          continue;
        }

        for (const item of events) {
          cursor = item.cursor;
          const payload = item.envelope.payload;
          eventsYielded += 1;
          yield {
            ...payload,
            cursor: item.cursor,
          };
          if (payload.type === "done" || payload.type === "cancelled" || payload.type === "error") {
            terminated = true;
            terminatedBy =
              payload.type === "done"
                ? "completed"
                : payload.type === "cancelled"
                  ? "cancelled"
                  : "error";
            break;
          }
        }
      }

      if (!terminated) {
        const latestCursor = await getLatestGenerationStreamCursor(generationId);
        const errorMessage = latestCursor
          ? "Generation is still processing. Reconnect with the returned cursor to resume stream replay."
          : "Generation is still processing but no stream events are currently available. Please retry shortly.";
        terminatedBy = "timeout";
        this.streamCounters.timedOut += 1;
        logServerEvent(
          "warn",
          "GENERATION_STREAM_TIMEOUT",
          {
            maxWaitMs,
            conversationType: initial.conversation.type,
            streamId,
            eventsYielded,
            redisReadCount,
            redisEmptyReadCount,
            cursor,
            latestCursor,
          },
          {
            source: "generation-manager",
            generationId: initial.id,
            conversationId: initial.conversationId,
            userId,
          },
        );
        eventsYielded += 1;
        yield { type: "error", message: errorMessage, cursor };
      }
    } finally {
      const currentCount = this.activeSubscriptionCounts.get(subscriptionKey) ?? 0;
      if (currentCount <= 1) {
        this.activeSubscriptionCounts.delete(subscriptionKey);
      } else {
        this.activeSubscriptionCounts.set(subscriptionKey, currentCount - 1);
      }
      this.streamCounters.closed += 1;

      logServerEvent(
        "info",
        "GENERATION_STREAM_SUBSCRIPTION_SUMMARY",
        {
          ...this.getStreamCountersSnapshot(),
          streamId,
          durationMs: Date.now() - startedAt,
          maxWaitMs,
          eventsYielded,
          redisReadCount,
          redisEmptyReadCount,
          cursor,
          termination: terminatedBy ?? "consumer_closed",
          conversationType: initial.conversation.type,
        },
        {
          source: "generation-manager",
          generationId: initial.id,
          conversationId: initial.conversationId,
          userId,
        },
      );
    }
  }

  /**
   * Cancel a generation
   */
  async cancelGeneration(generationId: string, userId: string): Promise<boolean> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
      columns: {
        id: true,
        status: true,
      },
    });
    if (!genRecord) {
      return false;
    }

    if (genRecord.conversation.userId !== userId) {
      throw new Error("Access denied");
    }

    if (
      genRecord.status === "completed" ||
      genRecord.status === "cancelled" ||
      genRecord.status === "error"
    ) {
      return true;
    }

    await db
      .update(generation)
      .set({ cancelRequestedAt: new Date() })
      .where(eq(generation.id, generationId));
    await getSandboxSlotManager().clearPendingRequest(generationId);

    const ctx = this.activeGenerations.get(generationId);
    if (ctx) {
      await this.releaseSandboxSlotLease(ctx);
      ctx.abortController.abort();
    }

    return true;
  }

  async resumeGeneration(generationId: string, userId: string): Promise<boolean> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });
    if (!genRecord) {
      return false;
    }
    if (!genRecord.conversation.userId || genRecord.conversation.userId !== userId) {
      throw new Error("Access denied");
    }
    if (
      genRecord.status === "completed" ||
      genRecord.status === "cancelled" ||
      genRecord.status === "error"
    ) {
      return false;
    }

    let pendingInterrupt = await generationInterruptService.getPendingInterruptForGeneration(
      generationId,
    );
    if (pendingInterrupt) {
      pendingInterrupt =
        (await generationInterruptService.refreshInterruptExpiry(
          pendingInterrupt.id,
          new Date(
            pendingInterrupt.kind === "auth"
              ? computeExpiryIso(AUTH_TIMEOUT_MS)
              : computeExpiryIso(APPROVAL_TIMEOUT_MS),
          ),
        )) ?? pendingInterrupt;
    }
    const nextStatus: GenerationStatus = pendingInterrupt
      ? pendingInterrupt.kind === "auth"
        ? "awaiting_auth"
        : "awaiting_approval"
      : "running";

    await db
      .update(generation)
      .set({
        status: nextStatus,
        isPaused: false,
      })
      .where(eq(generation.id, generationId));

    await db
      .update(conversation)
      .set({
        generationStatus:
          nextStatus === "running"
            ? "generating"
            : nextStatus === "awaiting_approval"
              ? "awaiting_approval"
              : "awaiting_auth",
        sandboxLastUserVisibleActionAt: new Date(),
      })
      .where(eq(conversation.id, genRecord.conversationId));

    const linkedRun = await db.query.coworkerRun.findFirst({
      where: eq(coworkerRun.generationId, generationId),
      columns: { id: true },
    });
    if (linkedRun?.id) {
      await db
        .update(coworkerRun)
        .set({
          status:
            nextStatus === "running"
              ? "running"
              : nextStatus === "awaiting_approval"
                ? "awaiting_approval"
                : "awaiting_auth",
        })
        .where(eq(coworkerRun.id, linkedRun.id));
    }

    const runType: "chat" | "coworker" = linkedRun ? "coworker" : "chat";
    if (nextStatus === "awaiting_approval" && pendingInterrupt?.expiresAt) {
      await this.enqueueGenerationTimeout(generationId, "approval", pendingInterrupt.expiresAt.toISOString());
    }
    if (nextStatus === "awaiting_auth" && pendingInterrupt?.expiresAt) {
      await this.enqueueGenerationTimeout(generationId, "auth", pendingInterrupt.expiresAt.toISOString());
    }
    if (this.shouldDeferGenerationToWorker()) {
      await this.enqueueGenerationRun(generationId, runType);
      return true;
    }

    if (!this.activeGenerations.has(generationId)) {
      this.runQueuedGeneration(generationId).catch((err) => {
        console.error("[GenerationManager] runQueuedGeneration error:", err);
      });
    }
    return true;
  }

  async processGenerationTimeout(generationId: string, kind: GenerationTimeoutKind): Promise<void> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });
    if (!genRecord) {
      return;
    }

    const now = Date.now();
    if (kind === "approval") {
      const pendingInterrupt = await generationInterruptService.getPendingInterruptForGeneration(
        generationId,
      );
      if (!pendingInterrupt || pendingInterrupt.kind === "auth" || genRecord.status !== "awaiting_approval") {
        return;
      }
      const expiresAtMs = resolveExpiryMs(
        pendingInterrupt.expiresAt?.toISOString(),
        pendingInterrupt.requestedAt.toISOString(),
        APPROVAL_TIMEOUT_MS,
      );
      if (Number.isFinite(expiresAtMs) && now < expiresAtMs) {
        return;
      }

      await db
        .update(generation)
        .set({
          status: "paused",
          isPaused: true,
        })
        .where(eq(generation.id, generationId));
      await db
        .update(conversation)
        .set({ generationStatus: "paused" })
        .where(eq(conversation.id, genRecord.conversationId));

      const linkedCoworkerRun = await db.query.coworkerRun.findFirst({
        where: eq(coworkerRun.generationId, generationId),
        columns: { id: true },
      });
      if (linkedCoworkerRun?.id) {
        await db
          .update(coworkerRun)
          .set({
            status: "paused",
          })
          .where(eq(coworkerRun.id, linkedCoworkerRun.id));
      }

      const ctx = this.activeGenerations.get(generationId);
      if (ctx && ctx.status === "awaiting_approval") {
        ctx.status = "paused";
        await this.releaseSandboxSlotLease(ctx);
        this.broadcast(ctx, { type: "status_change", status: "paused" });
        this.evictActiveGenerationContext(generationId);
      }
      return;
    }

    const pendingInterrupt = await generationInterruptService.getPendingInterruptForGeneration(
      generationId,
    );
    if (!pendingInterrupt || pendingInterrupt.kind !== "auth" || genRecord.status !== "awaiting_auth") {
      return;
    }
    const expiresAtMs = resolveExpiryMs(
      pendingInterrupt.expiresAt?.toISOString(),
      pendingInterrupt.requestedAt.toISOString(),
      AUTH_TIMEOUT_MS,
    );
    if (Number.isFinite(expiresAtMs) && now < expiresAtMs) {
      return;
    }

    await db
      .update(generation)
      .set({
        status: "paused",
        isPaused: true,
      })
      .where(eq(generation.id, generationId));

    await db
      .update(conversation)
      .set({ generationStatus: "paused" })
      .where(eq(conversation.id, genRecord.conversationId));

    const linkedCoworkerRun = await db.query.coworkerRun.findFirst({
      where: eq(coworkerRun.generationId, generationId),
      columns: { id: true },
    });
    if (linkedCoworkerRun?.id) {
      await db
        .update(coworkerRun)
        .set({ status: "paused" })
        .where(eq(coworkerRun.id, linkedCoworkerRun.id));
    }

    const ctx = this.activeGenerations.get(generationId);
    if (ctx && ctx.status === "awaiting_auth") {
      ctx.status = "paused";
      await this.releaseSandboxSlotLease(ctx);
      this.broadcast(ctx, { type: "status_change", status: "paused" });
      this.evictActiveGenerationContext(generationId);
    }
  }

  async processPreparingStuckCheck(generationId: string): Promise<void> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: {
        conversation: {
          columns: {
            id: true,
            userId: true,
            type: true,
          },
        },
      },
    });
    if (!genRecord) {
      return;
    }
    if (!genRecord.conversation || genRecord.conversation.type !== "chat") {
      return;
    }
    if (genRecord.status !== "running" || genRecord.sandboxId || genRecord.completedAt) {
      return;
    }

    const elapsedMs = Date.now() - genRecord.startedAt.getTime();
    if (elapsedMs < AGENT_PREPARING_TIMEOUT_MS) {
      return;
    }

    const userId = genRecord.conversation.userId ?? undefined;
    const details = {
      generationId: genRecord.id,
      conversationId: genRecord.conversation.id,
      userId,
      elapsedMs,
      thresholdMs: AGENT_PREPARING_TIMEOUT_MS,
      status: genRecord.status,
    };

    logServerEvent("warn", "GENERATION_PREPARING_STUCK_DETECTED", details, {
      source: "generation-manager",
      generationId: genRecord.id,
      conversationId: genRecord.conversation.id,
      userId,
    });

    const pushUrl = process.env.KUMA_PUSH_URL?.trim();
    if (!pushUrl) {
      return;
    }

    const monitorUrl = new URL(pushUrl);
    monitorUrl.searchParams.set("status", "down");
    monitorUrl.searchParams.set(
      "msg",
      `preparing agent timeout generation=${genRecord.id} conversation=${genRecord.conversation.id} user=${userId ?? "unknown"} elapsedMs=${elapsedMs}`,
    );
    monitorUrl.searchParams.set("ping", String(Math.max(1, Math.round(elapsedMs))));

    try {
      const response = await fetch(monitorUrl.toString(), { method: "GET" });
      if (!response.ok) {
        throw new Error(`Kuma push failed (${response.status})`);
      }
      logServerEvent("warn", "GENERATION_PREPARING_STUCK_KUMA_PUSHED", details, {
        source: "generation-manager",
        generationId: genRecord.id,
        conversationId: genRecord.conversation.id,
        userId,
      });
    } catch (error) {
      logServerEvent(
        "error",
        "GENERATION_PREPARING_STUCK_KUMA_PUSH_FAILED",
        {
          ...details,
          error: formatErrorMessage(error),
        },
        {
          source: "generation-manager",
          generationId: genRecord.id,
          conversationId: genRecord.conversation.id,
          userId,
        },
      );
    }
  }

  async reapStaleGenerations(): Promise<{
    scanned: number;
    stale: number;
    finalizedRunningAsError: number;
    finalizedOtherAsCancelled: number;
  }> {
    const candidates = await db.query.generation.findMany({
      where: and(
        isNull(generation.completedAt),
        inArray(generation.status, ["running", "awaiting_approval", "awaiting_auth"]),
        lt(
          generation.startedAt,
          new Date(
            Date.now() -
              Math.min(
                STALE_REAPER_RUNNING_MAX_AGE_MS,
                STALE_REAPER_AWAITING_APPROVAL_MAX_AGE_MS,
                STALE_REAPER_AWAITING_AUTH_MAX_AGE_MS,
              ),
          ),
        ),
      ),
      columns: {
        id: true,
        status: true,
        startedAt: true,
      },
    });

    const nowMs = Date.now();
    const staleRows = candidates.filter((row) => {
      const ageMs = nowMs - row.startedAt.getTime();
      switch (row.status) {
        case "running":
          return ageMs > STALE_REAPER_RUNNING_MAX_AGE_MS;
        case "awaiting_approval":
          return ageMs > STALE_REAPER_AWAITING_APPROVAL_MAX_AGE_MS;
        case "awaiting_auth":
          return ageMs > STALE_REAPER_AWAITING_AUTH_MAX_AGE_MS;
        default:
          return false;
      }
    });

    if (staleRows.length === 0) {
      return {
        scanned: candidates.length,
        stale: 0,
        finalizedRunningAsError: 0,
        finalizedOtherAsCancelled: 0,
      };
    }

    const staleRunningIds = staleRows
      .filter((row) => row.status === "running")
      .map((row) => row.id);
    const staleCancelledIds = staleRows
      .filter((row) => row.status !== "running")
      .map((row) => row.id);

    const completedAt = new Date();
    const staleRunningMessage =
      "Generation was marked as stale by the worker reaper after exceeding max running age.";

    if (staleRunningIds.length > 0) {
      await Promise.all(staleRunningIds.map((id) => generationInterruptService.cancelInterruptsForGeneration(id)));
      await db
        .update(generation)
        .set({
          status: "error",
          errorMessage: staleRunningMessage,
          pendingApproval: null,
          pendingAuth: null,
          isPaused: false,
          cancelRequestedAt: null,
          completedAt,
        })
        .where(inArray(generation.id, staleRunningIds));
    }

    if (staleCancelledIds.length > 0) {
      await Promise.all(staleCancelledIds.map((id) => generationInterruptService.cancelInterruptsForGeneration(id)));
      await db
        .update(generation)
        .set({
          status: "cancelled",
          pendingApproval: null,
          pendingAuth: null,
          isPaused: false,
          cancelRequestedAt: null,
          completedAt,
        })
        .where(inArray(generation.id, staleCancelledIds));
    }

    if (staleRunningIds.length > 0) {
      await db
        .update(coworkerRun)
        .set({
          status: "error",
          finishedAt: completedAt,
          errorMessage: staleRunningMessage,
        })
        .where(inArray(coworkerRun.generationId, staleRunningIds));
      await db
        .update(conversation)
        .set({ generationStatus: "error" })
        .where(inArray(conversation.currentGenerationId, staleRunningIds));
    }

    if (staleCancelledIds.length > 0) {
      await db
        .update(coworkerRun)
        .set({
          status: "cancelled",
          finishedAt: completedAt,
        })
        .where(inArray(coworkerRun.generationId, staleCancelledIds));
      await db
        .update(conversation)
        .set({ generationStatus: "idle" })
        .where(inArray(conversation.currentGenerationId, staleCancelledIds));
    }

    for (const row of staleRows) {
      const ctx = this.activeGenerations.get(row.id);
      if (ctx) {
        ctx.abortController.abort();
      }
      this.evictActiveGenerationContext(row.id);
    }

    return {
      scanned: candidates.length,
      stale: staleRows.length,
      finalizedRunningAsError: staleRunningIds.length,
      finalizedOtherAsCancelled: staleCancelledIds.length,
    };
  }

  private async refreshCancellationSignal(
    ctx: GenerationContext,
    options?: { force?: boolean },
  ): Promise<boolean> {
    if (ctx.abortController.signal.aborted) {
      return true;
    }

    const now = Date.now();
    if (
      !options?.force &&
      ctx.lastCancellationCheckAt &&
      now - ctx.lastCancellationCheckAt < CANCELLATION_POLL_INTERVAL_MS
    ) {
      return false;
    }
    ctx.lastCancellationCheckAt = now;

    const latest = await db.query.generation.findFirst({
      where: eq(generation.id, ctx.id),
      columns: {
        status: true,
        cancelRequestedAt: true,
      },
    });

    if (!latest) {
      return false;
    }

    if (latest.cancelRequestedAt || latest.status === "cancelled") {
      ctx.abortController.abort();
      return true;
    }

    return false;
  }

  /**
   * Submit an approval decision
   */
  async submitApproval(
    generationId: string,
    toolUseId: string,
    decision: "approve" | "deny",
    userId: string,
    questionAnswers?: string[][],
  ): Promise<boolean> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });
    if (!genRecord) {
      return false;
    }
    if (genRecord.conversation.userId !== userId) {
      throw new Error("Access denied");
    }

    const interrupt = await generationInterruptService.findPendingInterruptByToolUseId({
      generationId,
      providerToolUseId: toolUseId,
    });
    if (!interrupt) {
      return false;
    }

    const normalizedQuestionAnswers =
      questionAnswers
        ?.map((answers) =>
          answers.map((answer) => answer.trim()).filter((answer) => answer.length > 0),
        )
        .filter((answers) => answers.length > 0) ?? [];
    const approvalPart: ContentPart = {
      type: "approval",
      tool_use_id: interrupt.providerToolUseId,
      tool_name: interrupt.display.title,
      tool_input: interrupt.display.toolInput ?? {},
      integration: interrupt.display.integration ?? "cmdclaw",
      operation: interrupt.display.operation ?? "question",
      command: interrupt.display.command,
      status: decision === "approve" ? "approved" : "denied",
      question_answers:
        normalizedQuestionAnswers.length > 0
          ? normalizedQuestionAnswers
          : interrupt.responsePayload?.questionAnswers,
    };
    const baseContentParts = (genRecord.contentParts as ContentPart[] | null) ?? [];
    const nextContentParts = [...baseContentParts];
    const existingApprovalIndex = nextContentParts.findIndex(
      (part): part is ContentPart & { type: "approval" } =>
        part.type === "approval" && part.tool_use_id === interrupt.providerToolUseId,
    );
    if (existingApprovalIndex >= 0) {
      nextContentParts[existingApprovalIndex] = approvalPart;
    } else {
      nextContentParts.push(approvalPart);
    }

    await db
      .update(generation)
      .set({
        contentParts: nextContentParts.length > 0 ? nextContentParts : null,
      })
      .where(eq(generation.id, generationId));
    await this.touchConversationLastUserVisibleAction(genRecord.conversationId);

    const resolvedInterrupt = await generationInterruptService.resolveInterrupt({
      interruptId: interrupt.id,
      status: decision === "approve" ? "accepted" : "rejected",
      responsePayload:
        normalizedQuestionAnswers.length > 0 ? { questionAnswers: normalizedQuestionAnswers } : undefined,
      resolvedByUserId: userId,
    });

    const activeCtx = this.activeGenerations.get(generationId);
    if (activeCtx) {
      activeCtx.contentParts = nextContentParts;
      if (activeCtx.currentInterruptId === interrupt.id) {
        activeCtx.currentInterruptId = undefined;
      }
      if (resolvedInterrupt) {
        this.broadcast(activeCtx, this.projectInterruptResolvedEvent(resolvedInterrupt));
      }
    }

    if (genRecord.status === "paused") {
      return this.resumeGeneration(generationId, userId);
    }

    return true;
  }

  async getAllowedIntegrationsForGeneration(
    generationId: string,
  ): Promise<IntegrationType[] | null> {
    const linkedRun = await db.query.coworkerRun.findFirst({
      where: eq(coworkerRun.generationId, generationId),
      columns: { coworkerId: true },
    });
    if (!linkedRun) {
      return null;
    }

    const wf = await db.query.coworker.findFirst({
      where: eq(coworker.id, linkedRun.coworkerId),
      columns: { allowedIntegrations: true },
    });

    return (wf?.allowedIntegrations as IntegrationType[] | undefined) ?? null;
  }

  /**
   * Get generation status
   */
  async getGenerationStatus(generationId: string): Promise<{
    status: GenerationStatus;
    contentParts: ContentPart[];
    pendingApproval: PendingApproval | null;
    usage: { inputTokens: number; outputTokens: number };
  } | null> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
    });

    if (!genRecord) {
      return null;
    }

    const pendingInterrupt = await generationInterruptService.getPendingInterruptForGeneration(generationId);
    const pendingApproval =
      pendingInterrupt && pendingInterrupt.kind !== "auth"
        ? {
            toolUseId: pendingInterrupt.providerToolUseId,
            toolName: pendingInterrupt.display.title,
            toolInput: pendingInterrupt.display.toolInput ?? {},
            requestedAt: pendingInterrupt.requestedAt.toISOString(),
            expiresAt: pendingInterrupt.expiresAt?.toISOString(),
            integration: pendingInterrupt.display.integration ?? "cmdclaw",
            operation: pendingInterrupt.display.operation ?? "unknown",
            command: pendingInterrupt.display.command,
          }
        : null;

    return {
      status: genRecord.status as GenerationStatus,
      contentParts: genRecord.contentParts ?? [],
      pendingApproval,
      usage: {
        inputTokens: genRecord.inputTokens,
        outputTokens: genRecord.outputTokens,
      },
    };
  }

  private async getTerminalRecoveryEvent(
    genRecord: typeof generation.$inferSelect & {
      conversation?: typeof conversation.$inferSelect;
    },
    options?: { includeCursor?: boolean },
  ): Promise<GenerationStreamEvent | null> {
    const includeCursor = options?.includeCursor ?? true;
    const latestCursor = includeCursor ? await getLatestGenerationStreamCursor(genRecord.id) : null;
    if (genRecord.status === "completed" && genRecord.messageId) {
      const artifacts = await getDoneArtifacts(genRecord.messageId);
      const doneEvent: GenerationStreamEvent = {
        type: "done",
        generationId: genRecord.id,
        conversationId: genRecord.conversationId,
        messageId: genRecord.messageId,
        usage: {
          inputTokens: genRecord.inputTokens,
          outputTokens: genRecord.outputTokens,
          totalCostUsd: 0,
        },
      };
      if (artifacts !== undefined) {
        doneEvent.artifacts = artifacts;
      }
      if (latestCursor) {
        doneEvent.cursor = latestCursor;
      }
      return doneEvent;
    }
    if (genRecord.status === "cancelled") {
      const cancelledEvent: GenerationStreamEvent = {
        type: "cancelled",
        generationId: genRecord.id,
        conversationId: genRecord.conversationId,
        messageId: genRecord.messageId ?? undefined,
      };
      if (latestCursor) {
        cancelledEvent.cursor = latestCursor;
      }
      return cancelledEvent;
    }
    if (genRecord.status === "error") {
      const errorEvent: GenerationStreamEvent = {
        type: "error",
        message: genRecord.errorMessage || "Unknown error",
      };
      if (latestCursor) {
        errorEvent.cursor = latestCursor;
      }
      return errorEvent;
    }
    return null;
  }

  private getReplayToolUseMetadata(
    part: Extract<ContentPart, { type: "tool_use" }>,
  ): ToolUseMetadata {
    if (part.integration || part.operation) {
      return {
        integration: part.integration,
        operation: part.operation,
      };
    }
    const parsed = this.getToolUseMetadata(part.name, part.input);
    if (!parsed.integration && !parsed.operation) {
      return {};
    }
    return parsed;
  }

  private emitReplayPartEvent(
    generationId: string,
    conversationId: string,
    part: ContentPart,
    allParts: ContentPart[],
  ): GenerationStreamEvent | null {
    if (part.type === "text") {
      return { type: "text", content: part.text };
    }
    if (part.type === "tool_use") {
      const metadata = this.getReplayToolUseMetadata(part);
      const event: GenerationStreamEvent = {
        type: "tool_use",
        toolName: part.name,
        toolInput: part.input,
        toolUseId: part.id,
      };
      if (metadata.integration !== undefined) {
        event.integration = metadata.integration;
      }
      if (metadata.operation !== undefined) {
        event.operation = metadata.operation;
      }
      if (metadata.isWrite !== undefined) {
        event.isWrite = metadata.isWrite;
      }
      return event;
    }
    if (part.type === "tool_result") {
      const toolUse = allParts.find(
        (p): p is ContentPart & { type: "tool_use" } =>
          p.type === "tool_use" && p.id === part.tool_use_id,
      );
      return {
        type: "tool_result",
        toolName: toolUse?.name ?? "unknown",
        result: part.content,
        toolUseId: part.tool_use_id,
      };
    }
    if (part.type === "thinking") {
      return {
        type: "thinking",
        content: part.content,
        thinkingId: part.id,
      };
    }
    if (part.type === "approval") {
      return {
        type: "interrupt_resolved",
        interruptId: `approval-part:${generationId}:${part.tool_use_id}`,
        generationId,
        conversationId,
        kind:
          part.operation === "question" || (part.question_answers?.length ?? 0) > 0
            ? "runtime_question"
            : "plugin_write",
        status: part.status === "approved" ? "accepted" : "rejected",
        providerToolUseId: part.tool_use_id,
        display: {
          title: part.tool_name,
          integration: part.integration,
          operation: part.operation,
          command: part.command,
          toolInput:
            part.tool_input && typeof part.tool_input === "object"
              ? (part.tool_input as Record<string, unknown>)
              : undefined,
        },
        responsePayload: part.question_answers ? { questionAnswers: part.question_answers } : undefined,
      };
    }
    return null;
  }

  // ========== Private Methods ==========

  /**
   * Dispatch generation to the appropriate backend.
   */
  private async runGeneration(ctx: GenerationContext): Promise<void> {
    let leaseToken: string | null = null;
    try {
      leaseToken = await this.acquireGenerationLease(ctx.id);
    } catch (error) {
      ctx.errorMessage = error instanceof Error ? error.message : String(error);
      await this.finishGeneration(ctx, "error");
      return;
    }
    if (!leaseToken) {
      return;
    }

    const leaseRenewTimer = setInterval(() => {
      void this.renewGenerationLease(ctx.id, leaseToken).catch((err) => {
        console.error(`[GenerationManager] Failed to renew lease for generation ${ctx.id}:`, err);
      });
    }, 30_000);

    try {
      await this.hydrateStreamSequence(ctx);
      const trimmed = ctx.userMessageContent.trim();
      if (SESSION_RESET_COMMANDS.has(trimmed)) {
        await this.handleSessionReset(ctx);
        return;
      }
      if (await this.refreshCancellationSignal(ctx, { force: true })) {
        await this.finishGeneration(ctx, "cancelled");
        return;
      }
      const slotStatus = await this.waitForSandboxSlotLease(ctx, {
        allowWorkerRequeue: true,
      });
      if (slotStatus === "requeued") {
        return;
      }
      return this.runOpenCodeGeneration(ctx);
    } finally {
      clearInterval(leaseRenewTimer);
      await this.releaseSandboxSlotLease(ctx).catch((err) => {
        console.error(`[GenerationManager] Failed to release sandbox slot for generation ${ctx.id}:`, err);
      });
      await this.releaseGenerationLease(ctx.id, leaseToken).catch((err) => {
        console.error(`[GenerationManager] Failed to release lease for generation ${ctx.id}:`, err);
      });
    }
  }

  private async hydrateStreamSequence(ctx: GenerationContext): Promise<void> {
    try {
      const latest = await getLatestGenerationStreamEnvelope(ctx.id);
      if (!latest) {
        return;
      }
      ctx.streamSequence = Math.max(ctx.streamSequence, latest.envelope.sequence);
      ctx.streamLastCursor = latest.cursor;
    } catch (error) {
      logServerEvent(
        "warn",
        "GENERATION_STREAM_SEQUENCE_HYDRATE_FAILED",
        {
          error: formatErrorMessage(error),
        },
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
        },
      );
    }
  }

  private async handleSessionReset(ctx: GenerationContext): Promise<void> {
    try {
      await writeSessionTranscriptFromConversation({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        source: "manual_reset",
        messageLimit: 15,
        excludeUserMessages: Array.from(SESSION_RESET_COMMANDS),
      });
    } catch (err) {
      console.error("[GenerationManager] Failed to write session transcript:", err);
    }

    await db.insert(message).values({
      conversationId: ctx.conversationId,
      role: "system",
      content: `${SESSION_BOUNDARY_PREFIX}\n${new Date().toISOString()}`,
    });

    await db
      .update(conversation)
      .set({ opencodeSessionId: null })
      .where(eq(conversation.id, ctx.conversationId));

    ctx.sessionId = undefined;

    ctx.assistantContent = "Started a new session.";
    ctx.contentParts = [{ type: "text", text: ctx.assistantContent }];

    await this.finishGeneration(ctx, "completed");
  }

  /**
   * Original E2B/OpenCode generation flow. Delegates everything to OpenCode inside E2B sandbox.
   */
  private async runOpenCodeGeneration(ctx: GenerationContext): Promise<void> {
    let promptTimeoutTriggered = false;
    let clearPromptTimeout: (() => void) | undefined;
    try {
      if (await this.refreshCancellationSignal(ctx, { force: true })) {
        await this.finishGeneration(ctx, "cancelled");
        return;
      }

      if (!env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      // Get user's CLI environment and integrations
      const userTimezonePromise =
        typeof db.query.user?.findFirst === "function"
          ? db.query.user.findFirst({
              where: eq(user.id, ctx.userId),
              columns: { timezone: true },
            })
          : Promise.resolve(null);
      const [cliEnv, enabledIntegrations, dbUser] = await Promise.all([
        getCliEnvForUser(ctx.userId),
        getEnabledIntegrationTypes(ctx.userId),
        userTimezonePromise,
      ]);
      const { customSkillNames } = splitCoworkerAllowedSkillSlugs(ctx.allowedSkillSlugs ?? []);

      const allowedIntegrations = ctx.allowedIntegrations ?? enabledIntegrations;

      const cliInstructions = await getCliInstructionsWithCustom(allowedIntegrations, ctx.userId);
      const filteredCliEnv =
        ctx.allowedIntegrations !== undefined
          ? Object.fromEntries(
              Object.entries(cliEnv).filter(([key]) => {
                const envToIntegration: Record<string, IntegrationType> = {
                  GMAIL_ACCESS_TOKEN: "google_gmail",
                  OUTLOOK_ACCESS_TOKEN: "outlook",
                  OUTLOOK_CALENDAR_ACCESS_TOKEN: "outlook_calendar",
                  GOOGLE_CALENDAR_ACCESS_TOKEN: "google_calendar",
                  GOOGLE_DOCS_ACCESS_TOKEN: "google_docs",
                  GOOGLE_SHEETS_ACCESS_TOKEN: "google_sheets",
                  GOOGLE_DRIVE_ACCESS_TOKEN: "google_drive",
                  NOTION_ACCESS_TOKEN: "notion",
                  LINEAR_ACCESS_TOKEN: "linear",
                  GITHUB_ACCESS_TOKEN: "github",
                  AIRTABLE_ACCESS_TOKEN: "airtable",
                  SLACK_ACCESS_TOKEN: "slack",
                  HUBSPOT_ACCESS_TOKEN: "hubspot",
                  SALESFORCE_ACCESS_TOKEN: "salesforce",
                  DYNAMICS_ACCESS_TOKEN: "dynamics",
                  DYNAMICS_INSTANCE_URL: "dynamics",
                  LINKEDIN_ACCOUNT_ID: "linkedin",
                  UNIPILE_API_KEY: "linkedin",
                  UNIPILE_DSN: "linkedin",
                };
                const integration = envToIntegration[key];
                return integration ? ctx.allowedIntegrations!.includes(integration) : true;
              }),
            )
          : cliEnv;

      if (ctx.allowedIntegrations !== undefined) {
        filteredCliEnv.ALLOWED_INTEGRATIONS = ctx.allowedIntegrations.join(",");
      }
      if (dbUser?.timezone) {
        filteredCliEnv.CMDCLAW_USER_TIMEZONE = dbUser.timezone;
      }
      if (ctx.runtimeCallbackToken) {
        filteredCliEnv.CMDCLAW_GENERATION_CALLBACK_TOKEN = ctx.runtimeCallbackToken;
      }

      // Get conversation for existing session info
      const conv = await db.query.conversation.findFirst({
        where: eq(conversation.id, ctx.conversationId),
      });

      // Determine if we need to replay history (existing conversation)
      const hasExistingMessages = !ctx.isNewConversation;

      // Get or create sandbox with OpenCode session
      const agentInitStartedAt = Date.now();
      const agentInitWarnAfterMs = 15_000;
      ctx.agentInitStartedAt = agentInitStartedAt;
      ctx.agentInitReadyAt = undefined;
      ctx.agentInitFailedAt = undefined;
      this.markPhase(ctx, "agent_init_started");
      this.broadcast(ctx, {
        type: "status_change",
        status: "agent_init_started",
      });
      logServerEvent(
        "info",
        "AGENT_INIT_STARTED",
        {},
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
        },
      );
      const agentInitWarnTimer = setTimeout(() => {
        const elapsedMs = Date.now() - agentInitStartedAt;
        logServerEvent(
          "warn",
          "AGENT_INIT_SLOW",
          { elapsedMs },
          {
            source: "generation-manager",
            traceId: ctx.traceId,
            generationId: ctx.id,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
          },
        );
      }, agentInitWarnAfterMs);

      let client: RuntimeHarnessClient;
      let sessionId: string;
      let runtimeSandbox: Awaited<ReturnType<typeof getOrCreateConversationRuntime>>["sandbox"];
      try {
        const session = await withTimeout(
          getOrCreateConversationRuntime(
            {
              conversationId: ctx.conversationId,
              generationId: ctx.id,
              userId: ctx.userId,
              openAIAuthSource: ctx.authSource,
              anthropicApiKey: env.ANTHROPIC_API_KEY,
              integrationEnvs: filteredCliEnv,
            },
            {
              sandboxProviderOverride: ctx.sandboxProviderOverride,
              title: conv?.title || "Conversation",
              replayHistory: hasExistingMessages,
              telemetry: {
                source: "generation-manager",
                traceId: ctx.traceId,
                generationId: ctx.id,
                conversationId: ctx.conversationId,
                userId: ctx.userId,
              },
              onLifecycle: (stage, details) => {
                const status = `agent_init_${stage}`;
                this.markPhase(ctx, status);
                if (ctx.agentInitStartedAt) {
                  if (stage === "sandbox_created") {
                    ctx.agentSandboxReadyAt = Date.now();
                    ctx.agentSandboxMode = "created";
                  } else if (stage === "sandbox_reused") {
                    ctx.agentSandboxReadyAt = Date.now();
                    ctx.agentSandboxMode = "reused";
                  }
                }
                this.broadcast(ctx, { type: "status_change", status });
                const lifecycleEvent = status.toUpperCase();
                logServerEvent("info", lifecycleEvent, details ?? {}, {
                  source: "generation-manager",
                  traceId: ctx.traceId,
                  generationId: ctx.id,
                  conversationId: ctx.conversationId,
                  userId: ctx.userId,
                });
              },
            },
          ),
          AGENT_PREPARING_TIMEOUT_MS,
          `Agent preparation timed out after ${Math.round(AGENT_PREPARING_TIMEOUT_MS / 1000)} seconds.`,
        );
        client = session.harnessClient;
        sessionId = session.session.id;
        runtimeSandbox = session.sandbox;
        ctx.agentInitReadyAt = Date.now();
        this.markPhase(ctx, "agent_init_ready");
        this.broadcast(ctx, {
          type: "status_change",
          status: "agent_init_ready",
          metadata: {
            sandboxProvider: session.metadata.sandboxProvider,
            runtimeHarness: session.metadata.runtimeHarness,
            runtimeProtocolVersion: session.metadata.runtimeProtocolVersion,
            sandboxId: runtimeSandbox.sandboxId,
            sessionId,
          },
        });
        const durationMs = ctx.agentInitReadyAt - agentInitStartedAt;
        logServerEvent(
          "info",
          "AGENT_INIT_READY",
          {
            durationMs,
            sandboxProvider: session.metadata.sandboxProvider,
            runtimeHarness: session.metadata.runtimeHarness,
            runtimeProtocolVersion: session.metadata.runtimeProtocolVersion,
          },
          {
            source: "generation-manager",
            traceId: ctx.traceId,
            generationId: ctx.id,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            sessionId,
            sandboxId: runtimeSandbox.sandboxId,
          },
        );
      } catch (error) {
        ctx.agentInitFailedAt = Date.now();
        this.markPhase(ctx, "agent_init_failed");
        this.broadcast(ctx, {
          type: "status_change",
          status: "agent_init_failed",
        });
        const durationMs = ctx.agentInitFailedAt - agentInitStartedAt;
        logServerEvent(
          "error",
          "AGENT_INIT_FAILED",
          {
            durationMs,
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          },
          {
            source: "generation-manager",
            traceId: ctx.traceId,
            generationId: ctx.id,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
          },
        );
        throw error;
      } finally {
        clearTimeout(agentInitWarnTimer);
      }

      // Store session ID
      ctx.sessionId = sessionId;
      ctx.sandboxId = runtimeSandbox.sandboxId;

      await db
        .update(generation)
        .set({ sandboxId: runtimeSandbox.sandboxId })
        .where(eq(generation.id, ctx.id));

      // Persist reusable IDs immediately so follow-up turns can reuse session/sandbox
      // even if the current turn is interrupted before completion.
      await db
        .update(conversation)
        .set({
          opencodeSessionId: ctx.sessionId,
          opencodeSandboxId: ctx.sandboxId ?? null,
        })
        .where(eq(conversation.id, ctx.conversationId));

      // Record marker time for file collection and store sandbox reference
      ctx.generationMarkerTime = Date.now();
      ctx.sentFilePaths = new Set();
      ctx.userStagedFilePaths = new Set();
      ctx.sandbox = {
        setup: async () => undefined,
        execute: async (command, opts) => {
          const result = await runtimeSandbox.exec(command, {
            timeoutMs: opts?.timeout,
            env: opts?.env,
          });
          return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        },
        writeFile: async (filePath, content) => {
          if (typeof content === "string") {
            await runtimeSandbox.writeFile(filePath, content);
            return;
          }
          const buffer = Buffer.from(content);
          await runtimeSandbox.writeFile(
            filePath,
            buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            ) as ArrayBuffer,
          );
        },
        readFile: async (filePath) => runtimeSandbox.readFile(filePath),
        teardown: async () => undefined,
        isAvailable: () => true,
      };
      this.markPhase(ctx, "pre_prompt_setup_started");
      const prePromptStartedAt = Date.now();
      const prePromptBreakdown: Record<string, number> = {};
      const markPrePromptStep = (step: string, startedAt: number) => {
        prePromptBreakdown[step] = Date.now() - startedAt;
      };

      // Write memory files to sandbox
      let memoryInstructions = buildMemorySystemPrompt();
      let enabledSkillRows: Array<{ name: string; updatedAt: Date }> = [];
      let writtenSkills: string[] = [];
      let writtenIntegrationSkills: string[] = [];
      let prePromptCacheHit = false;
      try {
        const memorySyncStartedAt = Date.now();
        await syncMemoryFilesToSandbox(ctx.userId, runtimeSandbox);
        markPrePromptStep("syncMemoryFilesToSandboxMs", memorySyncStartedAt);
      } catch (err) {
        console.error("[GenerationManager] Failed to sync memory to sandbox:", err);
        memoryInstructions = buildMemorySystemPrompt();
      }

      const metadataQueryStartedAt = Date.now();
      const [loadedSkillRows, customCreds] = await Promise.all([
        db.query.skill.findMany({
          where: and(eq(skill.userId, ctx.userId), eq(skill.enabled, true)),
          columns: {
            name: true,
            updatedAt: true,
          },
        }),
        db.query.customIntegrationCredential.findMany({
          where: and(
            eq(customIntegrationCredential.userId, ctx.userId),
            eq(customIntegrationCredential.enabled, true),
          ),
          with: { customIntegration: true },
        }),
      ]);
      enabledSkillRows = loadedSkillRows;
      markPrePromptStep("loadSkillsAndCredsMs", metadataQueryStartedAt);

      const eligibleCustomCreds = customCreds.filter((cred) => {
        if (!ctx.allowedCustomIntegrations) {
          return true;
        }
        return ctx.allowedCustomIntegrations.includes(cred.customIntegration.slug);
      });

      const prePromptCacheKey = JSON.stringify({
        userId: ctx.userId,
        allowedIntegrations: [...allowedIntegrations].toSorted(),
        allowedCustomIntegrations: [...(ctx.allowedCustomIntegrations ?? [])].toSorted(),
        allowedSkillSlugs: [...(ctx.allowedSkillSlugs ?? [])].toSorted(),
        selectedPlatformSkillSlugs: [...(ctx.selectedPlatformSkillSlugs ?? [])].toSorted(),
        skills: enabledSkillRows
          .map((entry) => `${entry.name}:${entry.updatedAt.toISOString()}`)
          .toSorted(),
        customIntegrations: eligibleCustomCreds
          .map(
            (cred) =>
              `${cred.customIntegration.slug}:${cred.updatedAt.toISOString()}:${cred.customIntegration.updatedAt.toISOString()}`,
          )
          .toSorted(),
      });

      if (ctx.agentSandboxMode === "reused") {
        try {
          const cacheReadStartedAt = Date.now();
          const rawCache = await runtimeSandbox.readFile(PRE_PROMPT_CACHE_PATH);
          const parsed = JSON.parse(String(rawCache)) as Partial<PrePromptCacheRecord>;
          markPrePromptStep("readPrePromptCacheMs", cacheReadStartedAt);
          if (parsed.cacheKey === prePromptCacheKey) {
            prePromptCacheHit = true;
            if (Array.isArray(parsed.writtenSkills)) {
              writtenSkills = parsed.writtenSkills.filter(
                (value): value is string => typeof value === "string",
              );
            }
            if (Array.isArray(parsed.writtenIntegrationSkills)) {
              writtenIntegrationSkills = parsed.writtenIntegrationSkills.filter(
                (value): value is string => typeof value === "string",
              );
            }
            logServerEvent(
              "info",
              "PRE_PROMPT_CACHE_HIT",
              {
                skillsCount: writtenSkills.length,
                integrationSkillCount: writtenIntegrationSkills.length,
              },
              {
                source: "generation-manager",
                traceId: ctx.traceId,
                generationId: ctx.id,
                conversationId: ctx.conversationId,
                userId: ctx.userId,
                sandboxId: runtimeSandbox.sandboxId,
                sessionId: ctx.sessionId,
              },
            );
          }
        } catch {
          // Cache file absent or invalid; fall back to full prep.
        }
      }

      // Write custom skills/integration assets only when cache is stale.
      try {
        if (!prePromptCacheHit) {
          const writeSkillsStartedAt = Date.now();
          writtenSkills = await writeSkillsToSandbox(
            runtimeSandbox,
            ctx.userId,
            customSkillNames.length > 0 ? customSkillNames : undefined,
          );
          markPrePromptStep("writeSkillsToSandboxMs", writeSkillsStartedAt);

          const writeCustomCliStartedAt = Date.now();
          await Promise.all(
            eligibleCustomCreds.map(async (cred) => {
              const integ = cred.customIntegration;
              const cliPath = `/app/cli/custom-${integ.slug}.ts`;
              await runtimeSandbox.writeFile(cliPath, integ.cliCode);
            }),
          );
          markPrePromptStep("writeCustomIntegrationCliMs", writeCustomCliStartedAt);

          const customPerms: Record<string, { read: string[]; write: string[] }> = {};
          for (const cred of eligibleCustomCreds) {
            const integ = cred.customIntegration;
            customPerms[`custom-${integ.slug}`] = {
              read: integ.permissions.readOps,
              write: integ.permissions.writeOps,
            };
          }

          if (Object.keys(customPerms).length > 0) {
            // Set the permissions env var on the sandbox
            const writePermsStartedAt = Date.now();
            await runtimeSandbox.exec(
              `echo 'export CUSTOM_INTEGRATION_PERMISSIONS=${JSON.stringify(JSON.stringify(customPerms)).slice(1, -1)}' >> ~/.bashrc`,
            );
            markPrePromptStep("writeCustomIntegrationPermissionsMs", writePermsStartedAt);
          }

          const allowedSkillSlugs = new Set<string>(allowedIntegrations);
          for (const cred of eligibleCustomCreds) {
            allowedSkillSlugs.add(cred.customIntegration.slug);
          }

          const writeIntegrationSkillsStartedAt = Date.now();
          writtenIntegrationSkills = await writeResolvedIntegrationSkillsToSandbox(
            runtimeSandbox,
            ctx.userId,
            Array.from(allowedSkillSlugs),
          );
          markPrePromptStep("writeIntegrationSkillsMs", writeIntegrationSkillsStartedAt);

          const writePrePromptCacheStartedAt = Date.now();
          await runtimeSandbox.ensureDir(path.dirname(PRE_PROMPT_CACHE_PATH));
          const nextCacheRecord: PrePromptCacheRecord = {
            version: 1,
            cacheKey: prePromptCacheKey,
            writtenSkills,
            writtenIntegrationSkills,
            updatedAt: new Date().toISOString(),
          };
          await runtimeSandbox.writeFile(
            PRE_PROMPT_CACHE_PATH,
            JSON.stringify(nextCacheRecord, null, 2),
          );
          markPrePromptStep("writePrePromptCacheMs", writePrePromptCacheStartedAt);
        }
      } catch (e) {
        console.error("[Generation] Failed to write custom integration CLI code:", e);
      }
      markPrePromptStep("prePromptSetupTotalMs", prePromptStartedAt);
      logServerEvent(
        "info",
        "PRE_PROMPT_BREAKDOWN",
        {
          cacheHit: prePromptCacheHit,
          sandboxMode: ctx.agentSandboxMode ?? "unknown",
          ...prePromptBreakdown,
        },
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
          sandboxId: runtimeSandbox.sandboxId,
          sessionId: ctx.sessionId,
        },
      );

      if (writtenSkills.length === 0) {
        writtenSkills = enabledSkillRows.map((entry) => entry.name);
      }
      const skillsInstructions = getSkillsSystemPrompt(writtenSkills);
      const integrationSkillsInstructions =
        getIntegrationSkillsSystemPrompt(writtenIntegrationSkills);

      // Build system prompt
      const baseSystemPrompt = "You are CmdClaw, an AI agent that helps do work.";
      const modeBehaviorPrompt = this.buildModeBehaviorPrompt(ctx);
      const fileShareInstructions = [
        "## File Sharing",
        "When you create files that the user needs (PDFs, images, documents, code files, etc.), ",
        "save them to /app or /home/user. Files created during your response will automatically ",
        "be made available for download in the chat interface.",
      ].join("");
      const coworkerCliPrompt = !ctx.coworkerRunId ? getCoworkerCliSystemPrompt() : null;
      const coworkerPrompt = this.buildCoworkerPrompt(ctx);
      const coworkerBuilderPrompt = this.buildCoworkerBuilderPrompt(ctx);
      const integrationSkillDraftInstructions = this.getIntegrationSkillDraftInstructions();
      const selectedPlatformSkillInstructions = getSelectedPlatformSkillPrompt(
        ctx.selectedPlatformSkillSlugs,
      );
      const systemPromptParts = [
        baseSystemPrompt,
        modeBehaviorPrompt,
        fileShareInstructions,
        cliInstructions,
        coworkerCliPrompt,
        skillsInstructions,
        selectedPlatformSkillInstructions,
        integrationSkillsInstructions,
        integrationSkillDraftInstructions,
        memoryInstructions,
        coworkerPrompt,
        coworkerBuilderPrompt,
      ].filter(Boolean);
      const systemPrompt = systemPromptParts.join("\n\n");

      let currentTextPart: { type: "text"; text: string } | null = null;
      let currentTextPartId: string | null = null;
      const verboseOpenCodeEventLogs = process.env.OPENCODE_VERBOSE_EVENTS === "1";
      let opencodeEventCount = 0;
      let opencodeToolCallCount = 0;
      let opencodePermissionCount = 0;
      let opencodeQuestionCount = 0;
      let stagedUploadCount = 0;
      let stagedUploadFailureCount = 0;

      // Subscribe to SSE events BEFORE sending the prompt
      const promptTimeoutController = new AbortController();
      const eventResult = await client.subscribe({}, { signal: promptTimeoutController.signal });
      const eventStream = eventResult.stream;

      const parsedModel = parseModelReference(ctx.model);

      // Resolve provider from model reference
      const modelConfig = {
        providerID: parsedModel.providerID,
        modelID: parsedModel.modelID,
      };

      // Build prompt parts (text + file attachments)
      // For non-image files, write them to the sandbox so the LLM can process them
      // via sandbox tools, rather than passing unsupported media types directly.
      const promptParts: RuntimePromptPart[] = [{ type: "text", text: ctx.userMessageContent }];
      if (ctx.attachments && ctx.attachments.length > 0) {
        await Promise.all(
          ctx.attachments.map(async (a) => {
            if (a.mimeType.startsWith("image/")) {
              promptParts.push({
                type: "file",
                mime: a.mimeType,
                url: a.dataUrl,
                filename: a.name,
              });
              return;
            }

            // Write non-image file to sandbox and tell the LLM where it is
            const sandboxPath = `/home/user/uploads/${a.name}`;
            try {
              const base64Data = a.dataUrl.split(",")[1] || "";
              const buffer = Buffer.from(base64Data, "base64");
              await runtimeSandbox.writeFile(
                sandboxPath,
                buffer.buffer.slice(
                  buffer.byteOffset,
                  buffer.byteOffset + buffer.byteLength,
                ) as ArrayBuffer,
              );
              ctx.userStagedFilePaths?.add(sandboxPath);
              promptParts.push({
                type: "text",
                text: `The user uploaded a file: ${sandboxPath} (${a.mimeType}). You can read and process it using the sandbox tools.`,
              });
              stagedUploadCount += 1;
            } catch (err) {
              stagedUploadFailureCount += 1;
              console.error(
                `[GenerationManager] Failed to write file to sandbox: ${sandboxPath}`,
                err,
              );
              promptParts.push({
                type: "text",
                text: `The user tried to upload a file "${a.name}" but it could not be written to the sandbox.`,
              });
            }
          }),
        );
      }
      if (stagedUploadCount > 0 || stagedUploadFailureCount > 0) {
        logServerEvent(
          "info",
          "ATTACHMENTS_STAGED",
          { stagedUploadCount, stagedUploadFailureCount },
          {
            source: "generation-manager",
            traceId: ctx.traceId,
            generationId: ctx.id,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            sessionId,
          },
        );
      }

      // Send the prompt to OpenCode
      logServerEvent(
        "info",
        "OPENCODE_PROMPT_SENT",
        {},
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
          sessionId,
        },
      );
      this.markPhase(ctx, "prompt_sent");
      const promptSentAtMs = Date.now();
      const promptTimeoutId = setTimeout(() => {
        promptTimeoutTriggered = true;
        promptTimeoutController.abort();
        logServerEvent(
          "error",
          "OPENCODE_PROMPT_TIMEOUT",
          { timeoutMs: OPENCODE_PROMPT_TIMEOUT_MS },
          {
            source: "generation-manager",
            traceId: ctx.traceId,
            generationId: ctx.id,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            sessionId,
          },
        );
        void client.abort({ sessionID: sessionId }).catch((err) => {
          console.error("[GenerationManager] Failed to abort timed out OpenCode session:", err);
        });
      }, OPENCODE_PROMPT_TIMEOUT_MS);
      clearPromptTimeout = () => {
        clearTimeout(promptTimeoutId);
        clearPromptTimeout = undefined;
      };
      const promptPromise = client.prompt({
        sessionID: sessionId,
        parts: promptParts,
        system: systemPrompt,
        model: modelConfig,
      });

      // Process SSE events
      for await (const rawEvent of eventStream) {
        if (!ctx.phaseMarks?.first_event_received) {
          this.markPhase(ctx, "first_event_received");
        }
        const event = rawEvent as RuntimeEvent;
        if (await this.refreshCancellationSignal(ctx)) {
          break;
        }

        opencodeEventCount += 1;

        if (event.type === "message.part.updated") {
          const part = event.properties.part;
          if (part.type === "tool" && part.state.status === "pending") {
            opencodeToolCallCount += 1;
          }
        }

        if (verboseOpenCodeEventLogs) {
          const eventJson = JSON.stringify(event.properties || {});
          console.log("[OpenCode Event]", event.type, eventJson.slice(0, 200));
        } else if (
          event.type === "server.connected" ||
          event.type === "session.error" ||
          event.type === "session.idle"
        ) {
          console.info(
            `[OpenCode][EVENT] type=${event.type} generationId=${ctx.id} conversationId=${ctx.conversationId}`,
          );
        }

        // Transform tracked OpenCode events to GenerationEvents
        if (isOpenCodeTrackedEvent(event)) {
          await this.processOpencodeEvent(
            ctx,
            event,
            currentTextPart,
            currentTextPartId,
            (part, partId) => {
              currentTextPart = part;
              currentTextPartId = partId;
            },
          );
        }

        if (isOpenCodeActionableEvent(event)) {
          const actionableResult = await this.handleOpenCodeActionableEvent(ctx, client, event);
          if (actionableResult.type === "permission") {
            opencodePermissionCount += 1;
          } else if (actionableResult.type === "question") {
            opencodeQuestionCount += 1;
          }
        }

        // Check for session idle (generation complete)
        if (event.type === "session.idle") {
          this.markPhase(ctx, "session_idle");
          console.log("[GenerationManager] Session idle - generation complete");
          break;
        }

        // Check for session error
        if (event.type === "session.error") {
          const eventProps =
            typeof event.properties === "object" && event.properties !== null
              ? (event.properties as Record<string, unknown>)
              : {};
          const error = eventProps.error ?? "Unknown error";
          const errorObj =
            typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
          const nestedData =
            errorObj && typeof errorObj.data === "object" && errorObj.data !== null
              ? (errorObj.data as Record<string, unknown>)
              : null;
          const errorMessage =
            typeof error === "string"
              ? error
              : typeof nestedData?.message === "string"
                ? nestedData.message
                : typeof errorObj?.message === "string"
                  ? errorObj.message
                  : JSON.stringify(error);
          logServerEvent(
            "error",
            "OPENCODE_SESSION_ERROR",
            {
              errorMessage,
            },
            {
              source: "generation-manager",
              traceId: ctx.traceId,
              generationId: ctx.id,
              conversationId: ctx.conversationId,
              userId: ctx.userId,
              sessionId,
            },
          );
          throw new Error(errorMessage);
        }
      }

      // Wait for prompt to complete
      await promptPromise;
      clearPromptTimeout?.();
      const promptElapsedMs = Date.now() - promptSentAtMs;
      if (promptTimeoutTriggered || promptElapsedMs >= OPENCODE_PROMPT_TIMEOUT_MS) {
        promptTimeoutTriggered = true;
        throw new Error(
          `We stopped this run because it exceeded the time limit (${OPENCODE_PROMPT_TIMEOUT_LABEL}).`,
        );
      }
      this.markPhase(ctx, "prompt_completed");

      if (!ctx.assistantContent.trim()) {
        try {
          const messagesResult = await client.messages({
            sessionID: sessionId,
            limit: 20,
          });
          if (!messagesResult.error) {
            const fallbackText = extractAssistantTextFromSessionMessagesPayload(
              messagesResult.data,
            );
            if (fallbackText) {
              if (!ctx.phaseMarks?.first_visible_output_emitted) {
                this.markPhase(ctx, "first_visible_output_emitted");
              }
              if (!ctx.phaseMarks?.first_token_emitted) {
                this.markPhase(ctx, "first_token_emitted");
              }
              ctx.assistantContent = fallbackText;
              ctx.contentParts.push({ type: "text", text: fallbackText });
              this.broadcast(ctx, { type: "text", content: fallbackText });
              this.scheduleSave(ctx);
              logServerEvent(
                "info",
                "OPENCODE_FALLBACK_ASSISTANT_APPLIED",
                { chars: fallbackText.length },
                {
                  source: "generation-manager",
                  traceId: ctx.traceId,
                  generationId: ctx.id,
                  conversationId: ctx.conversationId,
                  userId: ctx.userId,
                  sessionId,
                },
              );
            }
          }
        } catch (error) {
          console.warn("[GenerationManager] Failed fallback session.messages fetch:", error);
        }
      }

      await this.refreshCancellationSignal(ctx, { force: true });
      this.markPhase(ctx, "post_processing_started");

      if (ctx.sandbox) {
        try {
          await this.importIntegrationSkillDraftsFromSandbox(ctx, ctx.sandbox);
        } catch (error) {
          console.error("[GenerationManager] Failed to import integration skill drafts:", error);
        }
      }
      await this.tryAutoApplyCoworkerBuilderPatch(ctx);

      // Collect new files created in the sandbox during generation
      let uploadedSandboxFileCount = 0;
      const shouldCollectSandboxFiles = opencodeToolCallCount > 0 || stagedUploadCount > 0;
      if (ctx.sandbox && ctx.generationMarkerTime && shouldCollectSandboxFiles) {
        try {
          const newFiles = await collectNewSandboxFiles(
            ctx.sandbox,
            ctx.generationMarkerTime,
            Array.from(new Set([...(ctx.sentFilePaths ?? []), ...(ctx.userStagedFilePaths ?? [])])),
          );
          const filesToUpload = filterAutoCollectedFilesMentionedInAnswer(
            newFiles,
            extractFinalAnswerTextForFileHeuristic(ctx),
          );

          console.log(
            `[GenerationManager] Found ${newFiles.length} new files in E2B sandbox; exposing ${filesToUpload.length} based on final-answer mentions`,
          );

          await Promise.all(
            filesToUpload.map(async (file) => {
              try {
                const fileRecord = await uploadSandboxFile({
                  path: file.path,
                  content: file.content,
                  conversationId: ctx.conversationId,
                });
                ctx.uploadedSandboxFileIds?.add(fileRecord.id);

                // Broadcast sandbox_file event so UI can update
                this.broadcast(ctx, {
                  type: "sandbox_file",
                  fileId: fileRecord.id,
                  path: file.path,
                  filename: fileRecord.filename,
                  mimeType: fileRecord.mimeType,
                  sizeBytes: fileRecord.sizeBytes,
                });

                uploadedSandboxFileCount += 1;
              } catch (err) {
                console.error(
                  `[GenerationManager] Failed to upload sandbox file ${file.path}:`,
                  err,
                );
              }
            }),
          );
        } catch (err) {
          console.error("[GenerationManager] Failed to collect sandbox files:", err);
        }
      }
      this.markPhase(ctx, "post_processing_completed");

      // Check if aborted
      if (ctx.abortController.signal.aborted) {
        console.info(
          `[GenerationManager][SUMMARY] status=cancelled generationId=${ctx.id} conversationId=${ctx.conversationId} durationMs=${Date.now() - ctx.startedAt.getTime()} opencodeEvents=${opencodeEventCount} toolCalls=${opencodeToolCallCount} permissions=${opencodePermissionCount} questions=${opencodeQuestionCount} stagedUploads=${stagedUploadCount} uploadedFiles=${uploadedSandboxFileCount}`,
        );
        await this.finishGeneration(ctx, "cancelled");
        return;
      }

      // Complete the generation
      console.info(
        `[GenerationManager][SUMMARY] status=completed generationId=${ctx.id} conversationId=${ctx.conversationId} durationMs=${Date.now() - ctx.startedAt.getTime()} opencodeEvents=${opencodeEventCount} toolCalls=${opencodeToolCallCount} permissions=${opencodePermissionCount} questions=${opencodeQuestionCount} stagedUploads=${stagedUploadCount} uploadedFiles=${uploadedSandboxFileCount}`,
      );
      await this.finishGeneration(ctx, "completed");
    } catch (error) {
      clearPromptTimeout?.();
      let promptTimeoutError: Error | null = null;
      if (promptTimeoutTriggered) {
        ctx.errorMessage = `We stopped this run because it exceeded the time limit (${OPENCODE_PROMPT_TIMEOUT_LABEL}).`;
        promptTimeoutError = new Error(
          `OpenCode prompt timed out after ${OPENCODE_PROMPT_TIMEOUT_MS}ms (${OPENCODE_PROMPT_TIMEOUT_LABEL}) for generation ${ctx.id}`,
        );
      }
      console.error("[GenerationManager] Error:", error);
      if (!ctx.errorMessage) {
        ctx.errorMessage = error instanceof Error ? error.message : "Unknown error";
      }
      console.info(
        `[GenerationManager][SUMMARY] status=error generationId=${ctx.id} conversationId=${ctx.conversationId} durationMs=${Date.now() - ctx.startedAt.getTime()} error=${JSON.stringify(ctx.errorMessage)}`,
      );
      await this.finishGeneration(ctx, "error");
      if (promptTimeoutError) {
        throw promptTimeoutError;
      }
    }
  }

  /**
   * Handle actionable OpenCode events that require explicit responses.
   */
  private async replyPermissionRequest(
    client: ApprovalCapableClient,
    input: { requestID: string; reply: "always" | "reject" },
  ): Promise<void> {
    if ("replyPermission" in client) {
      await client.replyPermission(input);
      return;
    }
    await client.permission.reply(input);
  }

  private async replyQuestionRequest(
    client: ApprovalCapableClient,
    input: { requestID: string; answers: string[][] },
  ): Promise<void> {
    if ("replyQuestion" in client) {
      await client.replyQuestion(input);
      return;
    }
    await client.question.reply(input);
  }

  private async rejectQuestionRequest(
    client: ApprovalCapableClient,
    input: { requestID: string },
  ): Promise<void> {
    if ("rejectQuestion" in client) {
      await client.rejectQuestion(input);
      return;
    }
    await client.question.reject(input);
  }

  private async handleOpenCodeActionableEvent(
    ctx: GenerationContext,
    client: ApprovalCapableClient,
    event: OpenCodeActionableEvent,
  ): Promise<{ type: "none" | "permission" | "question" }> {
    switch (event.type) {
      case "message.part.updated": {
        if (event.properties.part.type === "tool") {
          this.handleOpenCodeToolStateCoverage(event.properties.part);
        }
        return { type: "none" };
      }
      case "permission.asked": {
        await this.handleOpenCodePermissionAsked(ctx, client, event.properties);
        return { type: "permission" };
      }
      case "question.asked": {
        await this.handleOpenCodeQuestionAsked(ctx, client, event.properties);
        return { type: "question" };
      }
      default:
        return assertNever(event);
    }
  }

  private handleOpenCodeToolStateCoverage(part: Extract<RuntimePart, { type: "tool" }>): void {
    switch (part.state.status) {
      case "pending":
        return;
      case "running":
        return;
      case "completed":
        return;
      case "error":
        return;
      default:
        return assertNever(part.state);
    }
  }

  private async handleOpenCodePermissionAsked(
    ctx: GenerationContext,
    client: ApprovalCapableClient,
    request: RuntimePermissionRequest,
  ): Promise<void> {
    const permissionType = request.permission || "file access";
    const patterns = request.patterns;
    const allPatternsAllowed = shouldAutoApproveOpenCodePermission(permissionType, patterns);

    if (ctx.autoApprove || allPatternsAllowed) {
      console.log(
        "[GenerationManager] Auto-approving sandbox permission:",
        request.id,
        permissionType,
        patterns,
        ctx.autoApprove ? "(conversation auto-approve enabled)" : "(allowlisted path)",
      );
      try {
        await this.replyPermissionRequest(client, {
          requestID: request.id,
          reply: "always",
        });
      } catch (err) {
        console.error("[GenerationManager] Failed to approve permission:", err);
      }
      return;
    }

    console.log(
      "[GenerationManager] Surfacing permission request to UI:",
      request.id,
      request.permission,
      patterns,
    );

    const toolUseId = `opencode-perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const command = patterns?.length ? `${permissionType}: ${patterns.join(", ")}` : permissionType;

    await this.queueOpenCodeApprovalRequest(
      ctx,
      client,
      {
        kind: "permission",
        request,
      },
      {
        toolUseId,
        toolName: "Permission",
        toolInput: request as Record<string, unknown>,
        requestedAt: new Date().toISOString(),
        integration: "cmdclaw",
        operation: permissionType,
        command,
      },
    );
  }

  private async handleOpenCodeQuestionAsked(
    ctx: GenerationContext,
    client: ApprovalCapableClient,
    request: RuntimeQuestionRequest,
  ): Promise<void> {
    const defaultAnswers = buildDefaultQuestionAnswers(request);

    const toolUseId = `opencode-question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const command = buildQuestionCommand(request);

    await this.queueOpenCodeApprovalRequest(
      ctx,
      client,
      {
        kind: "question",
        request,
        defaultAnswers,
      },
      {
        toolUseId,
        toolName: "Question",
        toolInput: request as unknown as Record<string, unknown>,
        requestedAt: new Date().toISOString(),
        integration: "cmdclaw",
        operation: "question",
        command,
      },
    );
  }

  private async queueOpenCodeApprovalRequest(
    ctx: GenerationContext,
    client: ApprovalCapableClient,
    openCodeRequest:
      | { kind: "permission"; request: RuntimePermissionRequest }
      | { kind: "question"; request: RuntimeQuestionRequest; defaultAnswers: string[][] },
    pendingApproval: PendingApproval,
  ): Promise<void> {
    const expiresAt = computeExpiryIso(APPROVAL_TIMEOUT_MS);
    const interrupt = await generationInterruptService.createInterrupt({
      generationId: ctx.id,
      conversationId: ctx.conversationId,
      kind: openCodeRequest.kind === "question" ? "runtime_question" : "runtime_permission",
      display: {
        title: pendingApproval.toolName,
        integration: pendingApproval.integration,
        operation: pendingApproval.operation,
        command: pendingApproval.command,
        toolInput: pendingApproval.toolInput,
        questionSpec:
          openCodeRequest.kind === "question"
            ? {
                questions: openCodeRequest.request.questions.map((question) => ({
                  header: question.header,
                  question: question.question,
                  options: (question.options ?? []).map((option) => ({
                    label: option.label,
                    description: option.description,
                  })),
                  multiple: question.multiple === true ? true : undefined,
                  custom: question.custom === true ? true : undefined,
                })),
              }
            : undefined,
      },
      provider: "opencode",
      providerRequestId: openCodeRequest.request.id,
      providerToolUseId: pendingApproval.toolUseId,
      expiresAt: new Date(expiresAt),
    });

    ctx.status = "awaiting_approval";
    ctx.currentInterruptId = interrupt.id;

    if (ctx.coworkerRunId) {
      await db
        .update(coworkerRun)
        .set({ status: "awaiting_approval" })
        .where(eq(coworkerRun.id, ctx.coworkerRunId));
    }
    await this.enqueueGenerationTimeout(ctx.id, "approval", expiresAt);

    this.broadcast(ctx, this.projectInterruptPendingEvent(interrupt));

    const decision = await this.waitForOpenCodeApprovalDecision(interrupt.id);
    if (!decision) {
      await this.rejectOpenCodePendingApprovalRequest(ctx, client).catch((err) =>
        console.error("[GenerationManager] Failed to reject OpenCode request on timeout:", err),
      );
      await this.handleApprovalTimeout(ctx);
      return;
    }

    await this.applyOpenCodeApprovalDecision(
      ctx,
      interrupt.id,
      decision.decision,
      decision.questionAnswers,
      client,
    );
  }

  private async rejectOpenCodePendingApprovalRequest(
    ctx: GenerationContext,
    liveClient?: ApprovalCapableClient,
  ): Promise<void> {
    const interruptId = ctx.currentInterruptId;
    if (!interruptId) {
      return;
    }
    const interrupt = await generationInterruptService.getInterrupt(interruptId);
    const requestKind =
      interrupt?.kind === "runtime_permission"
        ? "permission"
        : interrupt?.kind === "runtime_question"
          ? "question"
          : undefined;
    const requestId = interrupt?.providerRequestId;
    if (!requestKind || !requestId) {
      return;
    }

    let opencodeClient = liveClient;
    if (!opencodeClient) {
      const slotStatus = await this.waitForSandboxSlotLease(ctx);
      if (slotStatus === "requeued") {
        return;
      }
      const conv = await db.query.conversation.findFirst({
        where: eq(conversation.id, ctx.conversationId),
        columns: { title: true },
      });
      const resumedSession = await getOrCreateConversationRuntime(
        {
          conversationId: ctx.conversationId,
          generationId: ctx.id,
          userId: ctx.userId,
          openAIAuthSource: ctx.authSource,
          anthropicApiKey: env.ANTHROPIC_API_KEY || "",
          integrationEnvs: {},
        },
        {
          sandboxProviderOverride: ctx.sandboxProviderOverride,
          title: conv?.title || "Conversation",
          replayHistory: false,
        },
      );
      opencodeClient = resumedSession.harnessClient;
    }

    if (requestKind === "permission") {
      await this.replyPermissionRequest(opencodeClient, {
        requestID: requestId,
        reply: "reject",
      });
      return;
    }
    await this.rejectQuestionRequest(opencodeClient, {
      requestID: requestId,
    });
  }

  private async waitForOpenCodeApprovalDecision(
    interruptId: string,
  ): Promise<{ decision: "allow" | "deny"; questionAnswers?: string[][] } | null> {
    while (true) {
      // eslint-disable-next-line no-await-in-loop -- polling by design
      await new Promise((resolve) => setTimeout(resolve, 400));
      const latest = await generationInterruptService.getInterrupt(interruptId);
      if (!latest) {
        return { decision: "deny" };
      }

      const expiresAtMs = resolveExpiryMs(
        latest.expiresAt?.toISOString(),
        latest.requestedAt.toISOString(),
        APPROVAL_TIMEOUT_MS,
      );
      if (Number.isFinite(expiresAtMs) && Date.now() >= expiresAtMs) {
        return null;
      }

      if (latest.status === "accepted") {
        return {
          decision: "allow",
          questionAnswers: latest.responsePayload?.questionAnswers,
        };
      }
      if (
        latest.status === "rejected" ||
        latest.status === "cancelled" ||
        latest.status === "expired"
      ) {
        return { decision: "deny" };
      }
    }
  }

  private async applyOpenCodeApprovalDecision(
    ctx: GenerationContext,
    interruptId: string,
    decision: "allow" | "deny",
    questionAnswers?: string[][],
    liveClient?: ApprovalCapableClient,
  ): Promise<void> {
    const interrupt = await generationInterruptService.getInterrupt(interruptId);
    const toolUseId = interrupt?.providerToolUseId ?? `opencode-${ctx.id}`;
    const requestKind =
      interrupt?.kind === "runtime_permission"
        ? "permission"
        : interrupt?.kind === "runtime_question"
          ? "question"
          : undefined;
    const requestId = interrupt?.providerRequestId;
    if (!requestKind || !requestId) {
      return;
    }

    let opencodeClient = liveClient;
    let defaultAnswers =
      interrupt?.display.questionSpec?.questions.map((question) => [
        question.options[0]?.label ?? "default answer",
      ]) ?? [[]];
    if (!opencodeClient) {
      const slotStatus = await this.waitForSandboxSlotLease(ctx);
      if (slotStatus === "requeued") {
        return;
      }
      const conv = await db.query.conversation.findFirst({
        where: eq(conversation.id, ctx.conversationId),
        columns: { title: true },
      });
      const resumedSession = await getOrCreateConversationRuntime(
        {
          conversationId: ctx.conversationId,
          generationId: ctx.id,
          userId: ctx.userId,
          openAIAuthSource: ctx.authSource,
          anthropicApiKey: env.ANTHROPIC_API_KEY || "",
          integrationEnvs: {},
        },
        {
          sandboxProviderOverride: ctx.sandboxProviderOverride,
          title: conv?.title || "Conversation",
          replayHistory: false,
        },
      );
      opencodeClient = resumedSession.harnessClient;
    }

    if (requestKind === "permission") {
      await this.replyPermissionRequest(opencodeClient, {
        requestID: requestId,
        reply: decision === "allow" ? "always" : "reject",
      });
    } else if (requestKind === "question") {
      if (decision === "allow") {
        await this.replyQuestionRequest(opencodeClient, {
          requestID: requestId,
          answers: questionAnswers && questionAnswers.length > 0 ? questionAnswers : defaultAnswers,
        });
      } else {
        await this.rejectQuestionRequest(opencodeClient, {
          requestID: requestId,
        });
      }
    }

    const normalizedQuestionAnswers =
      questionAnswers
        ?.map((answers) =>
          answers.map((answer) => answer.trim()).filter((answer) => answer.length > 0),
        )
        .filter((answers) => answers.length > 0) ?? [];
    const resolvedQuestionAnswers =
      decision === "allow"
        ? normalizedQuestionAnswers.length > 0
          ? normalizedQuestionAnswers
          : defaultAnswers
        : undefined;
    const approvalStatus = decision === "allow" ? "approved" : "denied";
    const existingApprovalIndex = ctx.contentParts.findIndex(
      (part): part is ContentPart & { type: "approval" } =>
        part.type === "approval" && part.tool_use_id === toolUseId,
    );
    const approvalPart: ContentPart = {
      type: "approval",
      tool_use_id: toolUseId,
      tool_name: interrupt?.display.title ?? "question",
      tool_input: interrupt?.display.toolInput ?? {},
      integration: interrupt?.display.integration ?? "opencode",
      operation: interrupt?.display.operation ?? "question",
      command: interrupt?.display.command,
      status: approvalStatus,
      question_answers: resolvedQuestionAnswers,
    };
    if (existingApprovalIndex >= 0) {
      ctx.contentParts[existingApprovalIndex] = approvalPart;
    } else {
      ctx.contentParts.push(approvalPart);
    }

    const resolvedInterrupt = await generationInterruptService.resolveInterrupt({
      interruptId,
      status: decision === "allow" ? "accepted" : "rejected",
      responsePayload:
        decision === "allow" ? { questionAnswers: resolvedQuestionAnswers } : undefined,
    });

    await db
      .update(generation)
      .set({
        contentParts: ctx.contentParts.length > 0 ? ctx.contentParts : null,
      })
      .where(eq(generation.id, ctx.id));

    if (ctx.coworkerRunId) {
      await db
        .update(coworkerRun)
        .set({ status: "running" })
        .where(eq(coworkerRun.id, ctx.coworkerRunId));
    }

    ctx.currentInterruptId = undefined;
    ctx.status = "running";
    if (resolvedInterrupt) {
      this.broadcast(ctx, this.projectInterruptResolvedEvent(resolvedInterrupt));
    }
  }

  /**
   * Process tracked OpenCode SSE events and transform them to GenerationEvent
   */
  private async processOpencodeEvent(
    ctx: GenerationContext,
    event: OpenCodeTrackedEvent,
    currentTextPart: { type: "text"; text: string } | null,
    currentTextPartId: string | null,
    setCurrentTextPart: (
      part: { type: "text"; text: string } | null,
      partId: string | null,
    ) => void,
  ): Promise<void> {
    switch (event.type) {
      case "message.updated": {
        const messageId = event.properties.info.id;
        const role = event.properties.info.role;

        if (messageId && role) {
          ctx.messageRoles.set(messageId, role);
        }

        if (messageId && role === "assistant") {
          ctx.assistantMessageIds.add(messageId);
          const pendingQueue = ctx.pendingMessageParts.get(messageId);
          if (pendingQueue && pendingQueue.parts.length > 0) {
            // eslint-disable-next-line drizzle/enforce-delete-with-where -- Map.delete, not a Drizzle query
            ctx.pendingMessageParts.delete(messageId);
            let replayTextPart = currentTextPart;
            let replayTextPartId = currentTextPartId;
            const replaySetCurrentTextPart = (
              part: { type: "text"; text: string } | null,
              partId: string | null,
            ) => {
              replayTextPart = part;
              replayTextPartId = partId;
              setCurrentTextPart(part, partId);
            };
            await Promise.all(
              pendingQueue.parts.map(async (pendingPart) => {
                await this.processOpencodeMessagePart(
                  ctx,
                  pendingPart,
                  replayTextPart,
                  replayTextPartId,
                  replaySetCurrentTextPart,
                );
              }),
            );
          }
        }
        break;
      }

      case "message.part.updated": {
        const part = event.properties.part;
        const messageID = part.messageID;
        this.pruneStalePendingMessageParts(ctx);

        if (messageID) {
          const role = ctx.messageRoles.get(messageID);
          if (role === "user") {
            return;
          }
          if (role !== "assistant") {
            // Preserve live streaming: process likely assistant parts immediately.
            // Queue only parts that strongly look like user-echo updates.
            if (!this.shouldProcessUnknownMessagePart(ctx, part)) {
              const now = Date.now();
              const existing = ctx.pendingMessageParts.get(messageID);
              const resetQueue =
                !existing || now - existing.firstQueuedAtMs > PENDING_MESSAGE_PARTS_TTL_MS;
              const parts = resetQueue ? [] : [...existing.parts];
              if (parts.length >= PENDING_MESSAGE_PARTS_MAX_PER_MESSAGE) {
                parts.shift();
              }
              parts.push(part);
              ctx.pendingMessageParts.set(messageID, {
                firstQueuedAtMs: resetQueue ? now : existing.firstQueuedAtMs,
                parts,
              });
              return;
            }
          }
        }

        await this.processOpencodeMessagePart(
          ctx,
          part,
          currentTextPart,
          currentTextPartId,
          setCurrentTextPart,
        );
        break;
      }

      case "session.updated": {
        // Track session metadata if needed
        ctx.sessionId = event.properties.info.id;
        break;
      }

      case "session.status": {
        // Can track status changes if needed
        break;
      }
      default:
        return assertNever(event);
    }
  }

  private shouldProcessUnknownMessagePart(ctx: GenerationContext, part: RuntimePart): boolean {
    if (part.type === "tool") {
      return true;
    }

    if (part.type !== "text") {
      return true;
    }

    const fullText = part.text.trim();
    const userText = ctx.userMessageContent.trim();
    if (!fullText) {
      return false;
    }

    // Guard against replaying user input text as assistant output.
    if (userText === fullText || userText.startsWith(fullText) || fullText.startsWith(userText)) {
      return false;
    }

    return true;
  }

  private async processOpencodeMessagePart(
    ctx: GenerationContext,
    part: RuntimePart,
    currentTextPart: { type: "text"; text: string } | null,
    currentTextPartId: string | null,
    setCurrentTextPart: (
      part: { type: "text"; text: string } | null,
      partId: string | null,
    ) => void,
  ): Promise<void> {
    const partId = part.id;

    // Text content
    // NOTE: OpenCode sends the FULL cumulative text with each update, not deltas
    // We need to calculate the delta ourselves
    if (part.type === "text") {
      const fullText = part.text;
      if (fullText) {
        // Check if this is a new text part (different part ID)
        const isNewPart = partId !== currentTextPartId;
        const userText = ctx.userMessageContent.trim();
        const normalizedUserText = userText.trim().replace(/\s+/g, " ");
        let effectiveFullText = fullText;

        const dropEchoPrefix = (value: string): string => {
          let next = value;
          // Common wrappers seen in compatibility streams.
          next = next.replace(/^\s*(?:user|human)\s*:\s*/i, "");
          next = next.replace(/^\s*["'`]+/, "");
          if (userText && next.startsWith(userText)) {
            return next.slice(userText.length).trimStart();
          }
          return value;
        };

        if (isNewPart && userText) {
          const normalizedFullText = fullText.trim().replace(/\s+/g, " ");
          // Ignore pure user-echo parts.
          if (normalizedFullText === normalizedUserText) {
            return;
          }
          effectiveFullText = dropEchoPrefix(fullText);
        }

        // Calculate delta from the previous text
        const previousLength = isNewPart ? 0 : (currentTextPart?.text.length ?? 0);
        const delta = effectiveFullText.slice(previousLength);

        // Only process if there's new content
        if (delta) {
          if (!ctx.phaseMarks?.first_visible_output_emitted) {
            this.markPhase(ctx, "first_visible_output_emitted");
          }
          if (!ctx.phaseMarks?.first_token_emitted) {
            this.markPhase(ctx, "first_token_emitted");
          }
          ctx.assistantContent += delta;
          this.broadcast(ctx, { type: "text", content: delta });

          if (currentTextPart && !isNewPart) {
            // Update to the full cumulative text
            currentTextPart.text = effectiveFullText;
          } else {
            // New text part - create a new entry
            const newPart = { type: "text" as const, text: effectiveFullText };
            ctx.contentParts.push(newPart);
            setCurrentTextPart(newPart, partId);
          }
          this.scheduleSave(ctx);
        }
      }
    }

    // Reasoning content ("internal thoughts") from OpenCode.
    // OpenCode updates this part cumulatively, so emit only the delta while
    // persisting the full content for replay/history.
    if (part.type === "reasoning") {
      setCurrentTextPart(null, null);
      const fullReasoning = part.text ?? "";
      const existingThinking = ctx.contentParts.find(
        (p): p is ContentPart & { type: "thinking" } => p.type === "thinking" && p.id === partId,
      );

      const previousReasoning = existingThinking?.content ?? "";
      const delta = fullReasoning.startsWith(previousReasoning)
        ? fullReasoning.slice(previousReasoning.length)
        : fullReasoning;

      if (existingThinking) {
        existingThinking.content = fullReasoning;
      } else {
        ctx.contentParts.push({
          type: "thinking",
          id: partId,
          content: fullReasoning,
        });
      }

      if (delta) {
        if (!ctx.phaseMarks?.first_visible_output_emitted) {
          this.markPhase(ctx, "first_visible_output_emitted");
        }
        this.broadcast(ctx, {
          type: "thinking",
          content: delta,
          thinkingId: partId,
        });
      }

      this.scheduleSave(ctx);
      return;
    }

    // Tool call (OpenCode uses "tool" type with callID, tool, and state properties)
    // See @opencode-ai/sdk ToolPart type: state contains input/output
    // Status flow: pending (no input) -> running (has input) -> completed (has output)
    if (part.type === "tool") {
      setCurrentTextPart(null, null);
      const toolUseId = part.callID;
      const toolName = part.tool;
      const toolInput = "input" in part.state ? (part.state.input as Record<string, unknown>) : {};
      const metadata = this.getToolUseMetadata(toolName, toolInput);

      const existingToolUse = ctx.contentParts.find(
        (p): p is ContentPart & { type: "tool_use" } => p.type === "tool_use" && p.id === toolUseId,
      );

      switch (part.state.status) {
        case "pending":
          return;
        case "running": {
          if (existingToolUse) {
            return;
          }

          this.broadcast(ctx, {
            type: "tool_use",
            toolName,
            toolInput,
            toolUseId,
            integration: metadata.integration,
            operation: metadata.operation,
            isWrite: metadata.isWrite,
          });

          ctx.contentParts.push({
            type: "tool_use",
            id: toolUseId,
            name: toolName,
            input: toolInput,
            integration: metadata.integration,
            operation: metadata.operation,
          });
          await this.saveProgress(ctx);
          return;
        }
        case "completed": {
          if (!existingToolUse) {
            return;
          }
          const result = limitToolResultContent(part.state.output);
          this.broadcast(ctx, {
            type: "tool_result",
            toolName: existingToolUse.name,
            result,
            toolUseId,
          });
          ctx.contentParts.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: result,
          });
          const coworkerInvocation = parseCoworkerInvocationEnvelope({
            toolName: existingToolUse.name,
            toolInput: existingToolUse.input,
            toolResult: result,
          });
          if (coworkerInvocation) {
            ctx.contentParts.push({
              type: "coworker_invocation",
              coworker_id: coworkerInvocation.coworkerId,
              username: coworkerInvocation.username,
              name: coworkerInvocation.name,
              run_id: coworkerInvocation.runId,
              conversation_id: coworkerInvocation.conversationId,
              generation_id: coworkerInvocation.generationId,
              status: coworkerInvocation.status,
              attachment_names: coworkerInvocation.attachmentNames,
              message: coworkerInvocation.message,
            });
          }
          await this.saveProgress(ctx);
          return;
        }
        case "error": {
          if (!existingToolUse) {
            return;
          }
          const result = limitToolResultContent({ error: part.state.error });
          this.broadcast(ctx, {
            type: "tool_result",
            toolName: existingToolUse.name,
            result,
            toolUseId,
          });
          ctx.contentParts.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: result,
          });
          await this.saveProgress(ctx);
          return;
        }
        default:
          return assertNever(part.state);
      }
    }
  }

  private getIntegrationSkillDraftInstructions(): string {
    return [
      "## Creating Integration Skills",
      "To create a new integration skill via chat, write a JSON draft file in:",
      "/app/.opencode/integration-skill-drafts/<slug>.json",
      "The server imports drafts automatically when generation completes.",
      "Draft schema:",
      "{",
      '  "slug": "integration-slug",',
      '  "title": "Skill title",',
      '  "description": "When and why to use this skill",',
      '  "setAsPreferred": true,',
      '  "files": [{"path":"SKILL.md","content":"..."}]',
      "}",
    ].join("\n");
  }

  private async importIntegrationSkillDraftsFromSandbox(
    ctx: GenerationContext,
    sandbox: SandboxBackend,
  ): Promise<void> {
    const findResult = await sandbox.execute(
      `find /app/.opencode/integration-skill-drafts -maxdepth 1 -type f -name '*.json' 2>/dev/null | head -20`,
    );
    const paths = findResult.stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    await Promise.all(
      paths.map(async (filePath) => {
        try {
          const content = await sandbox.readFile(filePath);
          const created = await this.importIntegrationSkillDraftContent(ctx, content);
          if (created > 0) {
            await sandbox.execute(`rm -f "${filePath}"`);
          }
        } catch (error) {
          console.error(
            `[GenerationManager] Failed to import integration skill draft ${filePath}:`,
            error,
          );
        }
      }),
    );
  }

  private async importIntegrationSkillDraftContent(
    ctx: GenerationContext,
    rawContent: string,
  ): Promise<number> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return 0;
    }

    const drafts = Array.isArray(parsed) ? parsed : [parsed];
    let createdCount = 0;

    const creationResults = await Promise.all(
      drafts.map(async (draft) => {
        if (!draft || typeof draft !== "object") {
          return 0;
        }
        const rec = draft as Record<string, unknown>;
        const slug = typeof rec.slug === "string" ? rec.slug : "";
        const title = typeof rec.title === "string" ? rec.title : "";
        const description = typeof rec.description === "string" ? rec.description : "";
        if (!slug || !title || !description) {
          return 0;
        }

        const files = Array.isArray(rec.files)
          ? rec.files
              .map((entry) => {
                if (!entry || typeof entry !== "object") {
                  return null;
                }
                const e = entry as Record<string, unknown>;
                if (typeof e.path !== "string" || typeof e.content !== "string") {
                  return null;
                }
                return { path: e.path, content: e.content };
              })
              .filter((entry): entry is { path: string; content: string } => !!entry)
          : [];

        try {
          await createCommunityIntegrationSkill(ctx.userId, {
            slug,
            title,
            description,
            files,
            setAsPreferred: rec.setAsPreferred === true,
          });
          return 1;
        } catch (error) {
          console.warn(
            `[GenerationManager] Skipped integration skill draft for slug '${slug}':`,
            error instanceof Error ? error.message : error,
          );
          return 0;
        }
      }),
    );
    createdCount = creationResults.reduce<number>((sum, value) => sum + value, 0);

    return createdCount;
  }

  private getToolUseMetadata(
    toolName: string,
    toolInput: Record<string, unknown>,
  ): ToolUseMetadata {
    if (toolName.toLowerCase() !== "bash") {
      return {};
    }

    const command = toolInput.command;
    if (typeof command !== "string" || command.trim().length === 0) {
      return {};
    }

    const parsed = parseBashCommand(command);
    if (!parsed) {
      return {};
    }

    return {
      integration: parsed.integration,
      operation: parsed.operation,
      isWrite: parsed.isWrite,
    };
  }

  private async forEachSequential<T>(
    items: readonly T[],
    handler: (item: T, index: number) => Promise<void>,
  ): Promise<void> {
    for (const [index, item] of items.entries()) {
      // eslint-disable-next-line no-await-in-loop -- sequential ordering is required
      await handler(item, index);
    }
  }

  private async consumeAsyncStream<T>(
    stream: AsyncIterable<T>,
    onEvent: (event: T) => Promise<boolean | void>,
  ): Promise<void> {
    for await (const event of stream) {
      const shouldStop = await onEvent(event);
      if (shouldStop) {
        break;
      }
    }
  }

  private async handleApprovalTimeout(ctx: GenerationContext): Promise<void> {
    if (ctx.status !== "awaiting_approval" || !ctx.currentInterruptId) {
      return;
    }

    console.log(`[GenerationManager] Approval timeout for generation ${ctx.id}, pausing sandbox`);

    ctx.status = "paused";

    // Update database
    await db
      .update(generation)
      .set({
        status: "paused",
        isPaused: true,
      })
      .where(eq(generation.id, ctx.id));

    await db
      .update(conversation)
      .set({ generationStatus: "paused" })
      .where(eq(conversation.id, ctx.conversationId));

    if (ctx.coworkerRunId) {
      await db.update(coworkerRun).set({ status: "paused" }).where(eq(coworkerRun.id, ctx.coworkerRunId));
    }

    await this.releaseSandboxSlotLease(ctx);
    this.broadcast(ctx, { type: "status_change", status: "paused" });
    this.evictActiveGenerationContext(ctx.id);
  }

  private async handleAuthTimeout(ctx: GenerationContext): Promise<void> {
    if (ctx.status !== "awaiting_auth" || !ctx.currentInterruptId) {
      return;
    }

    console.log(`[GenerationManager] Auth timeout for generation ${ctx.id}, pausing sandbox`);

    ctx.status = "paused";

    await db
      .update(generation)
      .set({
        status: "paused",
        isPaused: true,
      })
      .where(eq(generation.id, ctx.id));

    await db
      .update(conversation)
      .set({ generationStatus: "paused" })
      .where(eq(conversation.id, ctx.conversationId));

    if (ctx.coworkerRunId) {
      await db.update(coworkerRun).set({ status: "paused" }).where(eq(coworkerRun.id, ctx.coworkerRunId));
    }

    await this.releaseSandboxSlotLease(ctx);
    this.broadcast(ctx, { type: "status_change", status: "paused" });
    this.evictActiveGenerationContext(ctx.id);
  }

  /**
   * Submit an auth result (called after OAuth completes)
   */
  async submitAuthResult(
    generationId: string,
    integration: string,
    success: boolean,
    userId: string,
  ): Promise<boolean> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });

    if (!genRecord) {
      return false;
    }

    const recordUserId = genRecord.conversation.userId;
    if (recordUserId !== userId) {
      throw new Error("Access denied");
    }

    const pendingInterrupt = await generationInterruptService.findPendingAuthInterruptByIntegration({
      generationId,
      integration,
    });
    if (!pendingInterrupt) {
      return false;
    }

    const conversationId = genRecord.conversationId;
    const linkedCoworkerRun = await db.query.coworkerRun.findFirst({
      where: eq(coworkerRun.generationId, generationId),
      columns: { id: true },
    });
    await this.touchConversationLastUserVisibleAction(conversationId);

    if (!success) {
      await generationInterruptService.resolveInterrupt({
        interruptId: pendingInterrupt.id,
        status: "cancelled",
        responsePayload: { integration },
        resolvedByUserId: userId,
      });
      await db
        .update(generation)
        .set({
          status: "cancelled",
          completedAt: new Date(),
        })
        .where(eq(generation.id, generationId));

      await db
        .update(conversation)
        .set({ generationStatus: "idle" })
        .where(eq(conversation.id, conversationId));

      await this.enqueueConversationQueuedMessageProcess(conversationId);

      if (linkedCoworkerRun?.id) {
        await db
          .update(coworkerRun)
          .set({ status: "cancelled", finishedAt: new Date() })
          .where(eq(coworkerRun.id, linkedCoworkerRun.id));
      }

      return true;
    }

    const resolvedInterrupt = await generationInterruptService.resolveInterrupt({
      interruptId: pendingInterrupt.id,
      status: "accepted",
      responsePayload: {
        connectedIntegrations: [integration],
        integration,
      },
      resolvedByUserId: userId,
    });

    if (genRecord.status === "paused") {
      if (linkedCoworkerRun?.id) {
        await db.update(coworkerRun).set({ status: "running" }).where(eq(coworkerRun.id, linkedCoworkerRun.id));
      }
      const activeCtx = this.activeGenerations.get(generationId);
      if (activeCtx && resolvedInterrupt) {
        if (activeCtx.currentInterruptId === resolvedInterrupt.id) {
          activeCtx.currentInterruptId = undefined;
        }
        this.broadcast(activeCtx, this.projectInterruptResolvedEvent(resolvedInterrupt));
      }
      return this.resumeGeneration(generationId, userId);
    }

    await db
      .update(generation)
      .set({
        status: "running",
        pendingAuth: null,
        isPaused: false,
      })
      .where(eq(generation.id, generationId));

    await db
      .update(conversation)
      .set({
        generationStatus: "generating",
        sandboxLastUserVisibleActionAt: new Date(),
      })
      .where(eq(conversation.id, conversationId));

    if (linkedCoworkerRun?.id) {
      await db.update(coworkerRun).set({ status: "running" }).where(eq(coworkerRun.id, linkedCoworkerRun.id));
    }

    const activeCtx = this.activeGenerations.get(generationId);
    if (activeCtx && resolvedInterrupt) {
      activeCtx.status = "running";
      if (activeCtx.currentInterruptId === resolvedInterrupt.id) {
        activeCtx.currentInterruptId = undefined;
      }
      this.broadcast(activeCtx, this.projectInterruptResolvedEvent(resolvedInterrupt));
    }

    return true;
  }

  /**
   * Wait for user approval on a write operation (called by internal router from plugin).
   * This creates a pending approval request and waits for the user to respond.
   */
  async waitForApproval(
    generationId: string,
    request: {
      toolInput: Record<string, unknown>;
      integration: string;
      operation: string;
      command: string;
    },
  ): Promise<"allow" | "deny"> {
    const approvalRequest = await this.requestPluginApproval(generationId, request);
    if (approvalRequest.decision !== "pending") {
      return approvalRequest.decision;
    }
    if (!approvalRequest.toolUseId || !approvalRequest.interruptId) {
      return "deny";
    }

    let resolved: "allow" | "deny" | null = null;
    const approvalExpiryMs = approvalRequest.expiresAt
      ? Date.parse(approvalRequest.expiresAt)
      : Date.now() + APPROVAL_TIMEOUT_MS;
    while (resolved === null) {
      if (Date.now() >= approvalExpiryMs) {
        break;
      }
      // eslint-disable-next-line no-await-in-loop -- polling by design
      await new Promise((resolve) => setTimeout(resolve, 400));
      // eslint-disable-next-line no-await-in-loop -- polling by design
      const status = await this.getPluginApprovalStatus(generationId, approvalRequest.interruptId);
      if (status !== "pending") {
        resolved = status;
      }
    }

    if (resolved) {
      return resolved;
    }
    await this.processGenerationTimeout(generationId, "approval");
    return "deny";
  }

  async requestPluginApproval(
    generationId: string,
    request: {
      toolInput: Record<string, unknown>;
      integration: string;
      operation: string;
      command: string;
    },
  ): Promise<{
    decision: "allow" | "deny" | "pending";
    toolUseId?: string;
    interruptId?: string;
    expiresAt?: string;
  }> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });
    if (!genRecord) {
      return { decision: "deny" };
    }

    const policy = this.getExecutionPolicyFromRecord(genRecord, genRecord.conversation.autoApprove);
    if (policy.autoApprove ?? genRecord.conversation.autoApprove) {
      return { decision: "allow" };
    }

    const toolUseId = `plugin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = computeExpiryIso(APPROVAL_TIMEOUT_MS);
    const interrupt = await generationInterruptService.createInterrupt({
      generationId,
      conversationId: genRecord.conversationId,
      kind: "plugin_write",
      display: {
        title: "Bash",
        integration: request.integration,
        operation: request.operation,
        command: request.command,
        toolInput: request.toolInput,
      },
      provider: "plugin",
      providerToolUseId: toolUseId,
      expiresAt: new Date(expiresAt),
    });

    const pendingApprovalEvent = this.projectInterruptPendingEvent(interrupt);

    const activeCtx = this.activeGenerations.get(generationId);
    if (activeCtx) {
      activeCtx.status = "awaiting_approval";
      activeCtx.currentInterruptId = interrupt.id;
      this.broadcast(activeCtx, pendingApprovalEvent);
    } else {
      await this.publishDetachedGenerationStreamEvent({
        generationId,
        conversationId: genRecord.conversationId,
        event: pendingApprovalEvent,
      });
    }

    await this.enqueueGenerationTimeout(generationId, "approval", expiresAt);

    return { decision: "pending", toolUseId, interruptId: interrupt.id, expiresAt };
  }

  async requestAuthInterrupt(
    generationId: string,
    request: {
      integration: string;
      reason?: string;
    },
  ): Promise<{ interruptId: string; status: "pending"; expiresAt?: string } | { status: "accepted" }> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });
    if (!genRecord) {
      return { status: "accepted" };
    }

    const existing = await generationInterruptService.findPendingAuthInterruptByIntegration({
      generationId,
      integration: request.integration,
    });
    if (existing) {
      return {
        interruptId: existing.id,
        status: "pending",
        expiresAt: existing.expiresAt?.toISOString(),
      };
    }

    const expiresAt = computeExpiryIso(AUTH_TIMEOUT_MS);
    const interrupt = await generationInterruptService.createInterrupt({
      generationId,
      conversationId: genRecord.conversationId,
      kind: "auth",
      display: {
        title: "Connection Required",
        authSpec: {
          integrations: [request.integration],
          reason: request.reason,
        },
      },
      provider: "plugin",
      providerToolUseId: `auth-${Date.now()}-${request.integration}`,
      expiresAt: new Date(expiresAt),
    });

    const linkedCoworkerRun = await db.query.coworkerRun.findFirst({
      where: eq(coworkerRun.generationId, generationId),
      columns: { id: true },
    });
    if (linkedCoworkerRun?.id) {
      await db
        .update(coworkerRun)
        .set({ status: "awaiting_auth" })
        .where(eq(coworkerRun.id, linkedCoworkerRun.id));
    }

    const activeCtx = this.activeGenerations.get(generationId);
    if (activeCtx) {
      activeCtx.status = "awaiting_auth";
      activeCtx.currentInterruptId = interrupt.id;
      this.broadcast(activeCtx, this.projectInterruptPendingEvent(interrupt));
    } else {
      await this.publishDetachedGenerationStreamEvent({
        generationId,
        conversationId: genRecord.conversationId,
        event: this.projectInterruptPendingEvent(interrupt),
      });
    }
    await this.enqueueGenerationTimeout(generationId, "auth", expiresAt);

    return { interruptId: interrupt.id, status: "pending", expiresAt };
  }

  async getPluginApprovalStatus(
    generationId: string,
    interruptId: string,
  ): Promise<"pending" | "allow" | "deny"> {
    const genRecord = await db.query.generation.findFirst({ where: eq(generation.id, generationId) });
    const interrupt = await generationInterruptService.getInterrupt(interruptId);
    if (!genRecord || !interrupt || interrupt.generationId !== generationId) {
      return "deny";
    }

    if (interrupt.status === "pending") {
      const expiresAtMs = resolveExpiryMs(
        interrupt.expiresAt?.toISOString(),
        interrupt.requestedAt.toISOString(),
        APPROVAL_TIMEOUT_MS,
      );
      if (Number.isFinite(expiresAtMs) && Date.now() >= expiresAtMs) {
        await this.processGenerationTimeout(generationId, "approval");
        return "deny";
      }
      return "pending";
    }

    const resolvedDecision = interrupt.status === "accepted" ? "allow" : "deny";
    const approvalPart: ContentPart = {
      type: "approval",
      tool_use_id: interrupt.providerToolUseId,
      tool_name: interrupt.display.title,
      tool_input: interrupt.display.toolInput ?? {},
      integration: interrupt.display.integration ?? "plugin",
      operation: interrupt.display.operation ?? "unknown",
      command: interrupt.display.command,
      status: resolvedDecision === "allow" ? "approved" : "denied",
      question_answers: interrupt.responsePayload?.questionAnswers,
    };

    const activeCtx = this.activeGenerations.get(generationId);
    const baseContentParts =
      activeCtx?.contentParts ?? (genRecord.contentParts as ContentPart[] | null) ?? [];
    const nextContentParts = [...baseContentParts];
    const existingApprovalIndex = nextContentParts.findIndex(
      (part): part is ContentPart & { type: "approval" } =>
        part.type === "approval" && part.tool_use_id === interrupt.providerToolUseId,
    );
    if (existingApprovalIndex >= 0) {
      nextContentParts[existingApprovalIndex] = approvalPart;
    } else {
      nextContentParts.push(approvalPart);
    }
    if (activeCtx) {
      activeCtx.contentParts = nextContentParts;
    }

    await db
      .update(generation)
      .set({
        contentParts: nextContentParts.length > 0 ? nextContentParts : null,
      })
      .where(eq(generation.id, generationId));

    if (activeCtx) {
      this.broadcast(activeCtx, this.projectInterruptResolvedEvent(interrupt));
    }

    return resolvedDecision;
  }

  /**
   * Wait for OAuth authentication (called by internal router from plugin).
   * This creates a pending auth request and waits for the OAuth flow to complete.
   */
  async waitForAuth(
    generationId: string,
    request: {
      integration: string;
      reason?: string;
    },
  ): Promise<{ success: boolean; userId?: string }> {
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, generationId),
      with: { conversation: true },
    });
    if (!genRecord) {
      return { success: false };
    }

    const authRequest = await this.requestAuthInterrupt(generationId, request);
    if (authRequest.status === "accepted") {
      return genRecord.conversation.userId
        ? { success: true, userId: genRecord.conversation.userId }
        : { success: false };
    }
    const interrupt = await generationInterruptService.getInterrupt(authRequest.interruptId);
    if (!interrupt) {
      return { success: false };
    }
    const expiresAt = authRequest.expiresAt ?? computeExpiryIso(AUTH_TIMEOUT_MS);

    let resolved: { success: boolean; userId?: string } | null = null;
    while (resolved === null) {
      if (Date.now() >= Date.parse(expiresAt)) {
        break;
      }

      // eslint-disable-next-line no-await-in-loop -- polling by design
      await new Promise((resolve) => setTimeout(resolve, 400));

      // eslint-disable-next-line no-await-in-loop -- polling by design
      const latest = await generationInterruptService.getInterrupt(interrupt.id);
      if (!latest) {
        resolved = { success: false };
        break;
      }
      if (latest.status === "accepted") {
        resolved = genRecord.conversation.userId
          ? { success: true, userId: genRecord.conversation.userId }
          : { success: false };
        break;
      }
      if (
        latest.status === "rejected" ||
        latest.status === "expired" ||
        latest.status === "cancelled"
      ) {
        resolved = { success: false };
        break;
      }
    }

    if (resolved) {
      return resolved;
    }
    await this.processGenerationTimeout(generationId, "auth");
    return { success: false };
  }

  private async finishGeneration(
    ctx: GenerationContext,
    status: "completed" | "cancelled" | "error",
  ): Promise<void> {
    if (ctx.isFinalizing) {
      return;
    }
    if (ctx.status === "completed" || ctx.status === "cancelled" || ctx.status === "error") {
      return;
    }
    ctx.isFinalizing = true;

    try {
      // Clear any pending timeouts
      if (ctx.saveDebounceId) {
        clearTimeout(ctx.saveDebounceId);
      }
      if (ctx.approvalTimeoutId) {
        clearTimeout(ctx.approvalTimeoutId);
      }
      if (ctx.authTimeoutId) {
        clearTimeout(ctx.authTimeoutId);
      }
      await this.releaseSandboxSlotLease(ctx);
      await getSandboxSlotManager().clearPendingRequest(ctx.id);

      // NOTE: We set ctx.status AFTER publishing terminal events to Redis to avoid a race
      // where readers observe status changes before terminal events are available.

      let messageId: string | undefined;
      let completedAssistantContent: string | undefined;
      const shouldPersistErrorAssistantMessage = status === "error";

      if (status === "completed" || status === "cancelled" || shouldPersistErrorAssistantMessage) {
        // Update session ID
        if (status === "completed" && ctx.sessionId) {
          await db
            .update(conversation)
            .set({
              opencodeSessionId: ctx.sessionId,
              opencodeSandboxId: ctx.sandboxId ?? null,
            })
            .where(eq(conversation.id, ctx.conversationId));
        }

        // Auto-collect any new files created during generation (direct mode only)
        if (status === "completed" && ctx.sandbox && ctx.generationMarkerTime) {
          try {
            const excludePaths = Array.from(ctx.sentFilePaths || []);
            const stagedPaths = Array.from(ctx.userStagedFilePaths || []);
            const newFiles = await collectNewSandboxFiles(
              ctx.sandbox,
              ctx.generationMarkerTime,
              Array.from(new Set([...excludePaths, ...stagedPaths])),
            );
            const filesToUpload = filterAutoCollectedFilesMentionedInAnswer(
              newFiles,
              extractFinalAnswerTextForFileHeuristic(ctx),
            );

            console.log(
              `[GenerationManager] Found ${newFiles.length} new sandbox files; exposing ${filesToUpload.length} based on final-answer mentions`,
            );

            await Promise.all(
              filesToUpload.map(async (file) => {
                try {
                  const fileRecord = await uploadSandboxFile({
                    path: file.path,
                    content: file.content,
                    conversationId: ctx.conversationId,
                    messageId: undefined, // Will be linked below
                  });
                  ctx.uploadedSandboxFileIds?.add(fileRecord.id);

                  // Broadcast sandbox_file event
                  this.broadcast(ctx, {
                    type: "sandbox_file",
                    fileId: fileRecord.id,
                    path: file.path,
                    filename: fileRecord.filename,
                    mimeType: fileRecord.mimeType,
                    sizeBytes: fileRecord.sizeBytes,
                  });
                } catch (err) {
                  console.warn(
                    `[GenerationManager] Failed to upload collected file ${file.path}:`,
                    err,
                  );
                }
              }),
            );
          } catch (err) {
            console.error("[GenerationManager] Failed to collect new sandbox files:", err);
          }
        }

        const interruptionText = "Interrupted by user";
        const cancelledParts =
          status === "cancelled"
            ? [
                ...ctx.contentParts,
                ...(ctx.contentParts.some(
                  (part): part is ContentPart & { type: "system" } =>
                    part.type === "system" && part.content === interruptionText,
                )
                  ? []
                  : ([{ type: "system", content: interruptionText }] as ContentPart[])),
              ]
            : ctx.contentParts;

        // Keep interruption marker in generation record snapshot too.
        if (status === "cancelled") {
          ctx.contentParts = cancelledParts;
        }

        this.markPhase(ctx, "generation_completed");
        const messageTiming: MessageTiming = this.buildMessageTiming(ctx);

        // Save assistant message for completed/cancelled and recoverable error generations.
        const [assistantMessage] = await db
          .insert(message)
          .values({
            conversationId: ctx.conversationId,
            role: "assistant",
            content:
              status === "cancelled"
                ? ctx.assistantContent || interruptionText
                : ctx.assistantContent ||
                  ctx.errorMessage ||
                  "I apologize, but I couldn't generate a response.",
            contentParts: cancelledParts.length > 0 ? cancelledParts : null,
            inputTokens: ctx.usage.inputTokens,
            outputTokens: ctx.usage.outputTokens,
            timing: messageTiming,
          })
          .returning();

        messageId = assistantMessage.id;
        completedAssistantContent = assistantMessage.content;

        // Link uploaded sandbox files to the final assistant message
        const uploadedFileIds = Array.from(ctx.uploadedSandboxFileIds || []);
        if (status === "completed" && uploadedFileIds.length > 0) {
          const { sandboxFile } = await import("@cmdclaw/db/schema");
          const { inArray } = await import("drizzle-orm");
          await db
            .update(sandboxFile)
            .set({ messageId })
            .where(inArray(sandboxFile.id, uploadedFileIds));
        }

        // Generate title for new conversations
        if (status === "completed" && ctx.isNewConversation && ctx.assistantContent) {
          try {
            const title = await generateConversationTitle(
              ctx.userMessageContent,
              ctx.assistantContent,
            );
            if (title) {
              await db
                .update(conversation)
                .set({ title })
                .where(eq(conversation.id, ctx.conversationId));
            }
          } catch (err) {
            console.error("[GenerationManager] Failed to generate title:", err);
          }
        }
      }

      // Update generation record
      await generationInterruptService.cancelInterruptsForGeneration(ctx.id);
      await db
        .update(generation)
        .set({
          status,
          messageId,
          cancelRequestedAt: null,
          pendingApproval: null,
          pendingAuth: null,
          contentParts: ctx.contentParts.length > 0 ? ctx.contentParts : null,
          errorMessage: ctx.errorMessage,
          inputTokens: ctx.usage.inputTokens,
          outputTokens: ctx.usage.outputTokens,
          completedAt: new Date(),
        })
        .where(eq(generation.id, ctx.id));

      // Update conversation status
      await db
        .update(conversation)
        .set({
          generationStatus:
            status === "completed" ? "complete" : status === "error" ? "error" : "idle",
        })
        .where(eq(conversation.id, ctx.conversationId));

      if (status === "completed") {
        try {
          const sandboxRuntimeMs = ctx.sandboxId
            ? Math.max(0, Date.now() - ctx.startedAt.getTime())
            : 0;
          await trackGenerationBilling({
            generationId: ctx.id,
            conversationId: ctx.conversationId,
            model: ctx.model,
            inputTokens: ctx.usage.inputTokens,
            outputTokens: ctx.usage.outputTokens,
            sandboxRuntimeMs,
          });
        } catch (error) {
          console.error("[GenerationManager] Failed to track billing:", error);
        }
      }

      if (ctx.coworkerRunId) {
        await db
          .update(coworkerRun)
          .set({
            status:
              status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "error",
            finishedAt: new Date(),
            errorMessage: ctx.errorMessage,
          })
          .where(eq(coworkerRun.id, ctx.coworkerRunId));
      }

      await this.enqueueConversationQueuedMessageProcess(ctx.conversationId);

      // Publish terminal stream event before status finalization
      if (status === "completed" && messageId) {
        const artifacts = await getDoneArtifacts(messageId);
        this.broadcast(ctx, {
          type: "done",
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          messageId,
          usage: ctx.usage,
          artifacts,
        });

        try {
          await sendTaskDonePush({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            messageId,
            content: completedAssistantContent,
          });
        } catch (error) {
          console.error("[GenerationManager] Failed to send task completion push", {
            generationId: ctx.id,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            error,
          });
        }
      } else if (status === "cancelled") {
        this.broadcast(ctx, {
          type: "cancelled",
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          messageId,
        });
      } else if (status === "error") {
        this.broadcast(ctx, {
          type: "error",
          message: ctx.errorMessage || "Unknown error",
        });
      }

      logServerEvent(
        "info",
        "GENERATION_STREAM_PUBLISH_SUMMARY",
        {
          publishedCount: ctx.streamPublishedCount,
          lastCursor: ctx.streamLastCursor ?? null,
          lastSequence: ctx.streamSequence,
          firstVisiblePublishedAt: ctx.streamFirstVisiblePublishedAt
            ? new Date(ctx.streamFirstVisiblePublishedAt).toISOString()
            : null,
          terminalPublishedAt: ctx.streamTerminalPublishedAt
            ? new Date(ctx.streamTerminalPublishedAt).toISOString()
            : null,
          generationEventPublishMs:
            ctx.streamFirstVisiblePublishedAt && ctx.startedAt
              ? Math.max(0, ctx.streamFirstVisiblePublishedAt - ctx.startedAt.getTime())
              : undefined,
          generationTerminalPublishMs:
            ctx.streamTerminalPublishedAt && ctx.startedAt
              ? Math.max(0, ctx.streamTerminalPublishedAt - ctx.startedAt.getTime())
              : undefined,
        },
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
        },
      );

      // Set status AFTER broadcast so subscription loop receives the terminal event
      // before seeing the status change.
      ctx.status = status;

      // Cleanup
      this.evictActiveGenerationContext(ctx.id);
    } finally {
      ctx.isFinalizing = false;
    }
  }

  private scheduleSave(ctx: GenerationContext): void {
    if (ctx.saveDebounceId) {
      clearTimeout(ctx.saveDebounceId);
    }

    ctx.saveDebounceId = setTimeout(() => {
      this.saveProgress(ctx);
    }, SAVE_DEBOUNCE_MS);
  }

  private async saveProgress(ctx: GenerationContext): Promise<void> {
    ctx.lastSaveAt = new Date();

    await db
      .update(generation)
      .set({
        contentParts: ctx.contentParts.length > 0 ? ctx.contentParts : null,
        inputTokens: ctx.usage.inputTokens,
        outputTokens: ctx.usage.outputTokens,
      })
      .where(eq(generation.id, ctx.id));
  }

  private publishEventToRedisStream(ctx: GenerationContext, event: GenerationEvent): void {
    const nextSequence = ctx.streamSequence + 1;
    ctx.streamSequence = nextSequence;
    const envelope: GenerationStreamEnvelope = {
      generationId: ctx.id,
      conversationId: ctx.conversationId,
      sequence: nextSequence,
      eventType: event.type,
      payload: event,
      createdAtMs: Date.now(),
    };

    void publishGenerationStreamEvent(ctx.id, envelope)
      .then((cursor) => {
        ctx.streamLastCursor = cursor;
        ctx.streamPublishedCount += 1;
        if (
          (event.type === "text" || event.type === "thinking") &&
          ctx.streamFirstVisiblePublishedAt === undefined
        ) {
          ctx.streamFirstVisiblePublishedAt = Date.now();
        }
        if (event.type === "done" || event.type === "cancelled" || event.type === "error") {
          ctx.streamTerminalPublishedAt = Date.now();
        }
      })
      .catch((error) => {
        logServerEvent(
          "error",
          "GENERATION_STREAM_PUBLISH_FAILED",
          {
            error: formatErrorMessage(error),
            sequence: nextSequence,
            eventType: event.type,
          },
          {
            source: "generation-manager",
            traceId: ctx.traceId,
            generationId: ctx.id,
            conversationId: ctx.conversationId,
            userId: ctx.userId,
          },
        );
      });
  }

  private projectInterruptPendingEvent(interrupt: GenerationInterruptRecord): GenerationEvent {
    return {
      type: "interrupt_pending",
      ...generationInterruptService.projectInterruptEvent(interrupt),
    };
  }

  private projectInterruptResolvedEvent(interrupt: GenerationInterruptRecord): GenerationEvent {
    return {
      type: "interrupt_resolved",
      ...generationInterruptService.projectInterruptEvent(interrupt),
    };
  }

  private async publishDetachedGenerationStreamEvent(params: {
    generationId: string;
    conversationId: string;
    event: GenerationEvent;
  }): Promise<void> {
    try {
      const latest = await getLatestGenerationStreamEnvelope(params.generationId);
      const envelope: GenerationStreamEnvelope = {
        generationId: params.generationId,
        conversationId: params.conversationId,
        sequence: (latest?.envelope.sequence ?? 0) + 1,
        eventType: params.event.type,
        payload: params.event,
        createdAtMs: Date.now(),
      };
      await publishGenerationStreamEvent(params.generationId, envelope);
    } catch (error) {
      logServerEvent(
        "error",
        "GENERATION_STREAM_PUBLISH_FAILED",
        {
          error: formatErrorMessage(error),
          eventType: params.event.type,
        },
        {
          source: "generation-manager",
          generationId: params.generationId,
          conversationId: params.conversationId,
        },
      );
    }
  }

  private broadcast(ctx: GenerationContext, event: GenerationEvent): void {
    this.publishEventToRedisStream(ctx, event);

    if (ctx.coworkerRunId) {
      void this.recordCoworkerRunEvent(ctx.coworkerRunId, event);
    }
  }

  private buildCoworkerPrompt(ctx: GenerationContext): string | null {
    if (!ctx.coworkerPrompt && ctx.triggerPayload === undefined) {
      return null;
    }

    const sections = [
      ctx.coworkerPrompt ? `## Coworker Instructions\n${ctx.coworkerPrompt}` : null,
      ctx.coworkerPromptDo ? `## Do\n${ctx.coworkerPromptDo}` : null,
      ctx.coworkerPromptDont ? `## Don't\n${ctx.coworkerPromptDont}` : null,
      ctx.triggerPayload !== undefined
        ? `## Trigger Payload\n${JSON.stringify(ctx.triggerPayload, null, 2)}`
        : null,
    ].filter(Boolean);

    if (sections.length === 0) {
      return null;
    }
    return sections.join("\n\n");
  }

  private buildCoworkerBuilderPrompt(ctx: GenerationContext): string | null {
    if (!ctx.builderCoworkerContext) {
      return null;
    }

    const snapshot = JSON.stringify(
      {
        coworkerId: ctx.builderCoworkerContext.coworkerId,
        updatedAt: ctx.builderCoworkerContext.updatedAt,
        editable: {
          prompt: ctx.builderCoworkerContext.prompt,
          model: ctx.builderCoworkerContext.model,
          toolAccessMode: ctx.builderCoworkerContext.toolAccessMode,
          triggerType: ctx.builderCoworkerContext.triggerType,
          schedule: ctx.builderCoworkerContext.schedule,
          allowedIntegrations: ctx.builderCoworkerContext.allowedIntegrations,
        },
      },
      null,
      2,
    );

    return [
      "## Coworker Builder Context (System)",
      "You are in coworker builder mode.",
      "The coworker snapshot below is the latest server state. Only edit these fields: prompt, model, toolAccessMode, allowedIntegrations, triggerType, schedule.",
      "If the user asks to change editable coworker fields, emit exactly one patch block in this format:",
      "```coworker_builder_patch",
      '{ "baseUpdatedAt": "ISO_TIMESTAMP", "patch": { "prompt": "...", "model": "anthropic/claude-sonnet-4-6", "toolAccessMode": "all|selected", "allowedIntegrations": ["github"], "triggerType": "manual|schedule|email.forwarded|gmail.new_email|twitter.new_dm", "schedule": null|{...} } }',
      "```",
      "Rules:",
      "- Use baseUpdatedAt exactly from the snapshot below.",
      "- Include only fields that should change.",
      "- Do not include any extra top-level keys.",
      "- The patch block must be strict JSON (double quotes, no comments, no trailing commas).",
      "- Supported schedule formats:",
      '  - {"type":"interval","intervalMinutes":60..10080}',
      '  - {"type":"daily","time":"HH:MM","timezone":"Area/City"}',
      '  - {"type":"weekly","time":"HH:MM","daysOfWeek":[0..6],"timezone":"Area/City"}',
      '  - {"type":"monthly","time":"HH:MM","dayOfMonth":1..31,"timezone":"Area/City"}',
      "- If triggerType is schedule, include a valid schedule object.",
      "- If triggerType is not schedule, omit schedule unless explicitly asked to clear it with null.",
      '- For concrete coworker requests (for example: "send a message in #channel every hour"), emit a patch block in the same response, even if you also ask a follow-up question.',
      "- If information is missing, apply a best-effort default patch first, then ask a follow-up question.",
      '- Best-effort defaults: set triggerType=schedule with schedule {"type":"interval","intervalMinutes":60} for "every hour", and set prompt to a concise executable instruction.',
      "- If no editable coworker change is requested, do not emit a patch block.",
      "Snapshot:",
      snapshot,
    ].join("\n");
  }

  private sanitizeContentPartsAfterCoworkerPatchExtraction(ctx: GenerationContext): void {
    ctx.contentParts = ctx.contentParts
      .map((part) => {
        if (part.type !== "text") {
          return part;
        }
        const extracted = extractCoworkerBuilderPatch(part.text);
        return { ...part, text: extracted.sanitizedText };
      })
      .filter((part) => part.type !== "text" || part.text.trim().length > 0);
  }

  private appendSystemEvent(
    ctx: GenerationContext,
    event: { content: string; coworkerId?: string },
  ): void {
    ctx.contentParts.push({
      type: "system",
      content: event.content,
    });
    this.broadcast(ctx, {
      type: "system",
      content: event.content,
      coworkerId: event.coworkerId,
    });
  }

  private async tryAutoApplyCoworkerBuilderPatch(ctx: GenerationContext): Promise<void> {
    if (!ctx.builderCoworkerContext) {
      return;
    }

    const extraction = extractCoworkerBuilderPatch(ctx.assistantContent);
    ctx.assistantContent = extraction.sanitizedText;
    this.sanitizeContentPartsAfterCoworkerPatchExtraction(ctx);

    if (extraction.status === "none") {
      return;
    }

    const coworkerId = ctx.builderCoworkerContext.coworkerId;

    if (!COWORKER_BUILDER_AUTO_APPLY_ENABLED) {
      const content =
        "Coworker patch detected, but auto-apply is currently disabled by feature flag.";
      this.appendSystemEvent(ctx, { content, coworkerId });
      logServerEvent(
        "warn",
        "COWORKER_PATCH_APPLY_SKIPPED",
        { reason: "feature_flag_disabled", coworkerId },
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
        },
      );
      return;
    }

    if (extraction.status === "invalid") {
      const content = `Coworker patch failed: ${extraction.message}`;
      this.appendSystemEvent(ctx, { content, coworkerId });
      logServerEvent(
        "warn",
        "COWORKER_PATCH_PARSE_FAILED",
        {
          coworkerId,
          error: extraction.message,
          rawPatch: extraction.rawPatch,
        },
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
        },
      );
      return;
    }

    const dbUser = await db.query.user.findFirst({
      where: eq(user.id, ctx.userId),
      columns: { role: true },
    });

    const applyResult = await applyCoworkerBuilderPatch({
      database: db,
      userId: ctx.userId,
      userRole: dbUser?.role ?? null,
      coworkerId,
      conversationId: ctx.conversationId,
      baseUpdatedAt: extraction.envelope.baseUpdatedAt,
      patch: extraction.envelope.patch,
    });

    if (applyResult.status === "applied") {
      ctx.builderCoworkerContext = applyResult.coworker;
      const changed =
        applyResult.appliedChanges.length > 0 ? applyResult.appliedChanges.join(", ") : "none";
      const content = `Coworker updated by chat (${changed}).`;
      this.appendSystemEvent(ctx, { content, coworkerId });
      logServerEvent(
        "info",
        "COWORKER_PATCH_APPLIED",
        {
          coworkerId,
          changedFields: applyResult.appliedChanges,
        },
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
        },
      );
      return;
    }

    if (applyResult.status === "conflict") {
      ctx.builderCoworkerContext = applyResult.coworker;
      const content =
        "Coworker patch was not applied because the coworker changed. Please retry with latest state.";
      this.appendSystemEvent(ctx, { content, coworkerId });
      logServerEvent(
        "warn",
        "COWORKER_PATCH_CONFLICT",
        { coworkerId },
        {
          source: "generation-manager",
          traceId: ctx.traceId,
          generationId: ctx.id,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
        },
      );
      return;
    }

    const content = `Coworker patch validation failed: ${applyResult.details.join("; ")}`;
    this.appendSystemEvent(ctx, { content, coworkerId });
    logServerEvent(
      "warn",
      "COWORKER_PATCH_VALIDATION_FAILED",
      { coworkerId, details: applyResult.details },
      {
        source: "generation-manager",
        traceId: ctx.traceId,
        generationId: ctx.id,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
      },
    );
  }

  private buildModeBehaviorPrompt(ctx: GenerationContext): string | null {
    if (ctx.coworkerRunId) {
      return getCoworkerSystemBehaviorPrompt();
    }

    return getChatSystemBehaviorPrompt();
  }

  private async recordCoworkerRunEvent(
    coworkerRunId: string,
    event: GenerationEvent,
  ): Promise<void> {
    const loggableEvents = new Set([
      "tool_use",
      "tool_result",
      "interrupt_pending",
      "interrupt_resolved",
      "done",
      "error",
      "cancelled",
      "status_change",
      "system",
    ]);

    if (!loggableEvents.has(event.type)) {
      return;
    }

    await db.insert(coworkerRunEvent).values({
      coworkerRunId,
      type: event.type,
      payload: event,
    });
  }
}

// Stable singleton across dev hot-reloads/module re-evaluation.
const globalForGenerationManager = globalThis as typeof globalThis & {
  __cmdclawGenerationManager?: GenerationManager;
};

export const generationManager =
  globalForGenerationManager.__cmdclawGenerationManager ?? new GenerationManager();

if (process.env.NODE_ENV !== "production") {
  globalForGenerationManager.__cmdclawGenerationManager = generationManager;
}
