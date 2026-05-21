import type {
  ContentPart,
  PendingApproval,
  QueuedMessageAttachment,
} from "../../../../../packages/db/src/schema";

export type GenerationTurnKind = "chat" | "coworker";

export type GenerationStatus =
  | "running"
  | "awaiting_approval"
  | "awaiting_auth"
  | "paused"
  | "completed"
  | "cancelled"
  | "error";

export type GenerationTerminalStatus = "completed" | "cancelled" | "error";

export type GenerationCompletionReason =
  | "completed"
  | "user_cancel"
  | "runtime_error"
  | "approval_timeout"
  | "auth_timeout"
  | "run_deadline"
  | "bootstrap_timeout"
  | "sandbox_missing"
  | "broken_runtime_state"
  | "infra_disconnect";

export type StartedGeneration = {
  generationId: string;
  conversationId: string;
};

export type GenerationStatusView = {
  status: GenerationStatus;
  contentParts: ContentPart[];
  pendingApproval: PendingApproval | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type QueuedConversationTurn = {
  id: string;
  content: string;
  fileAttachments?: UserFileAttachment[];
  selectedPlatformSkillSlugs?: string[];
  status: "queued" | "processing";
  createdAt: Date;
};

export type UserFileAttachment = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type QueuedTurnAttachment = QueuedMessageAttachment;

export type GenerationEvent =
  | { type: "text"; content: string; cursor?: string }
  | { type: "thinking"; content: string; thinkingId: string; cursor?: string }
  | {
      type: "tool_use";
      toolName: string;
      toolInput: unknown;
      toolUseId: string;
      integration?: string;
      operation?: string;
      isWrite?: boolean;
      cursor?: string;
    }
  | {
      type: "tool_result";
      toolName: string;
      result: unknown;
      toolUseId: string;
      cursor?: string;
    }
  | {
      type: "interrupt_pending";
      interruptId: string;
      generationId: string;
      runtimeId: string;
      conversationId: string;
      turnSeq: number;
      kind: string;
      status: "pending";
      providerToolUseId: string;
      display: unknown;
      cursor?: string;
    }
  | {
      type: "interrupt_resolved";
      interruptId: string;
      generationId: string;
      runtimeId: string;
      conversationId: string;
      turnSeq: number;
      kind: string;
      status: "accepted" | "rejected" | "cancelled" | "expired";
      providerToolUseId: string;
      display: unknown;
      responsePayload?: unknown;
      cursor?: string;
    }
  | {
      type: "status_change";
      status: string;
      metadata?: Record<string, unknown>;
      cursor?: string;
    }
  | {
      type: "sandbox_file";
      fileId: string;
      path: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      cursor?: string;
    }
  | {
      type: "system";
      content: string;
      coworkerId?: string;
      cursor?: string;
    }
  | {
      type: "done";
      generationId: string;
      conversationId: string;
      messageId: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalCostUsd?: number;
      };
      artifacts?: unknown;
      cursor?: string;
    }
  | {
      type: "cancelled";
      generationId: string;
      conversationId: string;
      messageId?: string;
      cursor?: string;
    }
  | {
      type: "error";
      message: string;
      diagnosticMessage?: string;
      cursor?: string;
    };
