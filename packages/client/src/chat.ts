import { GENERATION_ERROR_PHASES } from "@cmdclaw/core/lib/generation-errors";
import { normalizeGenerationError } from "./generation-errors";
import {
  createGenerationRuntime,
  type RuntimeAssistantMessage,
} from "./generation-runtime";
import { runGenerationStream } from "./generation-stream";
import type {
  AuthNeededData,
  CmdclawApiClient,
  GenerationPendingApprovalData,
  GenerationResult,
  GenerationStartInput,
  GenerationUsage,
  DoneArtifactsData,
} from "./types";

type ChatRunOptions = {
  client: CmdclawApiClient;
  input?: GenerationStartInput;
  generationId?: string;
  signal?: AbortSignal;
  onText?: (content: string) => void | Promise<void>;
  onThinking?: (content: string) => void | Promise<void>;
  onToolUse?: (data: {
    toolName: string;
    toolInput: unknown;
    toolUseId?: string;
    integration?: string;
    operation?: string;
    isWrite?: boolean;
  }) => void | Promise<void>;
  onToolResult?: (toolName: string, result: unknown, toolUseId?: string) => void | Promise<void>;
  onPendingApproval?: (
    data: GenerationPendingApprovalData,
    client: CmdclawApiClient,
  ) => Promise<"handled" | "deferred">;
  onAuthNeeded?: (
    data: AuthNeededData,
    client: CmdclawApiClient,
  ) => Promise<"handled" | "deferred">;
};

function toAssistantMessage(runtime: ReturnType<typeof createGenerationRuntime>): RuntimeAssistantMessage {
  return runtime.buildAssistantMessage() as RuntimeAssistantMessage;
}

export async function runChatSession(options: ChatRunOptions): Promise<GenerationResult> {
  if (!options.input && !options.generationId) {
    throw new Error("runChatSession requires either input or generationId");
  }
  if (options.input && options.generationId) {
    throw new Error("runChatSession accepts input or generationId, not both");
  }

  const runtime = createGenerationRuntime();
  const abortController = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, abortController.signal])
    : abortController.signal;

  const mutable: {
    pendingApproval: GenerationPendingApprovalData | null;
    pendingAuth: AuthNeededData | null;
    done: {
      generationId: string;
      conversationId: string;
      messageId: string;
      usage: GenerationUsage;
      artifacts?: DoneArtifactsData;
    } | null;
    cancelled: {
      generationId: string;
      conversationId: string;
      messageId?: string;
    } | null;
    failed: ReturnType<typeof normalizeGenerationError> | null;
    resolvedIds: {
      generationId?: string;
      conversationId?: string;
    };
  } = {
    pendingApproval: null,
    pendingAuth: null,
    done: null,
    cancelled: null,
    failed: null,
    resolvedIds: {
      generationId: options.generationId,
    },
  };

  try {
    const result = await runGenerationStream({
      client: options.client,
      input: options.input,
      generationId: options.generationId,
      signal,
      callbacks: {
        onStarted: (generationId, conversationId) => {
          mutable.resolvedIds = { generationId, conversationId };
        },
        onText: async (text) => {
          runtime.handleText(text);
          await options.onText?.(text);
        },
        onSystem: (data) => {
          runtime.handleSystem(data.content);
        },
        onThinking: async (data) => {
          runtime.handleThinking(data);
          await options.onThinking?.(data.content);
        },
        onToolUse: async (data) => {
          runtime.handleToolUse(data);
          await options.onToolUse?.(data);
        },
        onToolResult: async (toolName, result, toolUseId) => {
          runtime.handleToolResult(toolName, result, toolUseId);
          await options.onToolResult?.(toolName, result, toolUseId);
        },
        onPendingApproval: async (data) => {
          runtime.handlePendingApproval(data);
          mutable.resolvedIds = {
            generationId: data.generationId,
            conversationId: data.conversationId,
          };
          if (options.onPendingApproval) {
            const status = await options.onPendingApproval(data, options.client);
            if (status === "handled") {
              return;
            }
          }
          mutable.pendingApproval = data;
          abortController.abort();
        },
        onApprovalResult: (toolUseId, decision) => {
          runtime.handleApprovalResult(toolUseId, decision);
        },
        onApproval: (data) => {
          runtime.handleApproval(data);
        },
        onAuthNeeded: async (data) => {
          runtime.handleAuthNeeded(data);
          mutable.resolvedIds = {
            generationId: data.generationId,
            conversationId: data.conversationId,
          };
          if (options.onAuthNeeded) {
            const status = await options.onAuthNeeded(data, options.client);
            if (status === "handled") {
              return;
            }
          }
          mutable.pendingAuth = data;
          abortController.abort();
        },
        onAuthProgress: (connected, remaining) => {
          runtime.handleAuthProgress(connected, remaining);
        },
        onAuthResult: (success) => {
          runtime.handleAuthResult(success);
        },
        onSandboxFile: (file) => {
          runtime.handleSandboxFile(file);
        },
        onDone: (generationId, conversationId, messageId, usage, artifacts) => {
          runtime.handleDone({
            generationId,
            conversationId,
            messageId,
          });
          mutable.resolvedIds = { generationId, conversationId };
          mutable.done = {
            generationId,
            conversationId,
            messageId,
            usage,
            artifacts,
          };
        },
        onError: (error) => {
          runtime.handleError();
          mutable.failed = error;
        },
        onCancelled: (data) => {
          runtime.handleCancelled();
          mutable.cancelled = data;
        },
        onStatusChange: (_status) => {
          runtime.setStatus("streaming");
        },
      },
    });

    if (result) {
      mutable.resolvedIds = result;
    }
  } catch (error) {
    mutable.failed = normalizeGenerationError(error, GENERATION_ERROR_PHASES.STREAM);
  }

  const assistant = toAssistantMessage(runtime);

  const approval = mutable.pendingApproval;
  if (approval !== null) {
    return {
      status: "needs_approval",
      generationId: approval.generationId,
      conversationId: approval.conversationId,
      approval,
      assistant,
    };
  }

  const auth = mutable.pendingAuth;
  if (auth !== null) {
    return {
      status: "needs_auth",
      generationId: auth.generationId,
      conversationId: auth.conversationId,
      auth,
      assistant,
    };
  }

  const completed = mutable.done;
  if (completed !== null) {
    return {
      status: "completed",
      generationId: completed.generationId,
      conversationId: completed.conversationId,
      messageId: completed.messageId,
      usage: completed.usage,
      artifacts: completed.artifacts,
      assistant,
    };
  }

  const cancelledResult = mutable.cancelled;
  if (cancelledResult !== null) {
    return {
      status: "cancelled",
      generationId: cancelledResult.generationId,
      conversationId: cancelledResult.conversationId,
      messageId: cancelledResult.messageId,
      assistant,
    };
  }

  return {
    status: "failed",
    generationId: mutable.resolvedIds.generationId,
    conversationId: mutable.resolvedIds.conversationId,
    error:
      mutable.failed ??
      normalizeGenerationError(
        "Generation stream closed before a terminal event",
        GENERATION_ERROR_PHASES.STREAM,
      ),
    assistant,
  };
}
