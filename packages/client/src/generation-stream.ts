import { GENERATION_ERROR_PHASES } from "@cmdclaw/core/lib/generation-errors";
import { normalizeGenerationError, type NormalizedGenerationError } from "./generation-errors";
import type {
  AuthNeededData,
  CmdclawApiClient,
  DoneArtifactsData,
  GenerationApprovalData,
  GenerationPendingApprovalData,
  GenerationStartInput,
  SandboxFileData,
  StatusChangeMetadata,
  ThinkingData,
  ToolUseData,
} from "./types";

export type GenerationCallbacks = {
  onText?: (content: string) => void | Promise<void>;
  onSystem?: (data: { content: string; coworkerId?: string }) => void | Promise<void>;
  onThinking?: (data: ThinkingData) => void | Promise<void>;
  onToolUse?: (data: ToolUseData) => void | Promise<void>;
  onToolResult?: (toolName: string, result: unknown, toolUseId?: string) => void | Promise<void>;
  onPendingApproval?: (data: GenerationPendingApprovalData) => void | Promise<void>;
  onApprovalResult?: (toolUseId: string, decision: "approved" | "denied") => void | Promise<void>;
  onApproval?: (data: GenerationApprovalData) => void | Promise<void>;
  onAuthNeeded?: (data: AuthNeededData) => void | Promise<void>;
  onAuthProgress?: (connected: string, remaining: string[]) => void | Promise<void>;
  onAuthResult?: (success: boolean, integrations?: string[]) => void | Promise<void>;
  onSandboxFile?: (data: SandboxFileData) => void | Promise<void>;
  onDone?: (
    generationId: string,
    conversationId: string,
    messageId: string,
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalCostUsd: number;
    },
    artifacts?: DoneArtifactsData,
  ) => void | Promise<void>;
  onStarted?: (generationId: string, conversationId: string) => void | Promise<void>;
  onError?: (error: NormalizedGenerationError) => void | Promise<void>;
  onCancelled?: (data: {
    generationId: string;
    conversationId: string;
    messageId?: string;
  }) => void | Promise<void>;
  onStatusChange?: (status: string, metadata?: StatusChangeMetadata) => void | Promise<void>;
};

type RunGenerationStreamParams = {
  client: CmdclawApiClient;
  input?: GenerationStartInput;
  generationId?: string;
  signal?: AbortSignal;
  callbacks: GenerationCallbacks;
};

function shouldReconnectWithCursor(event: {
  type: string;
  message?: string;
  cursor?: string;
}): event is { type: "error"; message: string; cursor: string } {
  return (
    event.type === "error" &&
    typeof event.cursor === "string" &&
    event.cursor.length > 0 &&
    typeof event.message === "string" &&
    event.message.includes("Reconnect with the returned cursor")
  );
}

export async function runGenerationStream(
  params: RunGenerationStreamParams,
): Promise<{ generationId: string; conversationId: string } | null> {
  const { client, input, callbacks, signal } = params;
  let generationId = params.generationId;
  let conversationId: string | undefined;
  let cursor: string | undefined;

  if (input) {
    const started = await client.generation.startGeneration(input);
    generationId = started.generationId;
    conversationId = started.conversationId;
    await callbacks.onStarted?.(started.generationId, started.conversationId);
  }

  if (!generationId) {
    throw new Error("runGenerationStream requires either input or generationId");
  }

  let shouldReconnect = false;
  do {
    shouldReconnect = false;
    const iterator = signal
      ? await client.generation.subscribeGeneration(
          cursor ? { generationId, cursor } : { generationId },
          { signal },
        )
      : await client.generation.subscribeGeneration(cursor ? { generationId, cursor } : { generationId });

    for await (const event of iterator) {
      if (signal?.aborted) {
        break;
      }
      if (event.cursor) {
        cursor = event.cursor;
      }

      switch (event.type) {
        case "text":
          await callbacks.onText?.(event.content);
          break;
        case "system":
          await callbacks.onSystem?.({
            content: event.content,
            coworkerId: event.coworkerId,
          });
          break;
        case "thinking":
          await callbacks.onThinking?.({
            content: event.content,
            thinkingId: event.thinkingId,
          });
          break;
        case "tool_use":
          await callbacks.onToolUse?.({
            toolName: event.toolName,
            toolInput: event.toolInput,
            toolUseId: event.toolUseId,
            integration: event.integration,
            operation: event.operation,
            isWrite: event.isWrite,
          });
          break;
        case "tool_result":
          await callbacks.onToolResult?.(event.toolName, event.result, event.toolUseId);
          break;
        case "interrupt_pending":
          conversationId = event.conversationId;
          if (event.kind === "auth") {
            await callbacks.onAuthNeeded?.({
              interruptId: event.interruptId,
              generationId: event.generationId,
              conversationId: event.conversationId,
              integrations: event.display.authSpec?.integrations ?? [],
              reason: event.display.authSpec?.reason,
            });
          } else {
            await callbacks.onPendingApproval?.({
              interruptId: event.interruptId,
              generationId: event.generationId,
              conversationId: event.conversationId,
              toolUseId: event.providerToolUseId,
              toolName: event.display.title,
              toolInput: event.display.toolInput ?? {},
              integration: event.display.integration ?? "cmdclaw",
              operation: event.display.operation ?? "unknown",
              command: event.display.command,
            });
          }
          break;
        case "interrupt_resolved":
          if (event.kind === "auth") {
            const connectedIntegrations = event.responsePayload?.connectedIntegrations ?? [];
            const remaining = (event.display.authSpec?.integrations ?? []).filter(
              (integration) => !connectedIntegrations.includes(integration),
            );
            await Promise.all(
              connectedIntegrations.map((connected) =>
                callbacks.onAuthProgress?.(connected, remaining),
              ),
            );
            await callbacks.onAuthResult?.(
              event.status === "accepted",
              event.display.authSpec?.integrations,
            );
          } else {
            const toolUseId = event.providerToolUseId;
            const decision = event.status === "accepted" ? "approved" : "denied";
            await callbacks.onApprovalResult?.(toolUseId, decision);
            await callbacks.onApproval?.({
              toolUseId,
              toolName: event.display.title,
              toolInput: event.display.toolInput ?? {},
              integration: event.display.integration ?? "cmdclaw",
              operation: event.display.operation ?? "unknown",
              command: event.display.command,
              status: decision,
              questionAnswers: event.responsePayload?.questionAnswers,
            });
          }
          break;
        case "sandbox_file":
          await callbacks.onSandboxFile?.({
            fileId: event.fileId,
            path: event.path,
            filename: event.filename,
            mimeType: event.mimeType,
            sizeBytes: event.sizeBytes,
          });
          break;
        case "done":
          conversationId = event.conversationId;
          await callbacks.onDone?.(
            event.generationId,
            event.conversationId,
            event.messageId,
            event.usage,
            event.artifacts,
          );
          break;
        case "error":
          if (!signal?.aborted && shouldReconnectWithCursor(event)) {
            shouldReconnect = true;
            break;
          }
          await callbacks.onError?.({
            ...normalizeGenerationError(event.message, GENERATION_ERROR_PHASES.STREAM),
            diagnosticMessage: event.diagnosticMessage,
          });
          break;
        case "cancelled":
          await callbacks.onCancelled?.({
            generationId: event.generationId,
            conversationId: event.conversationId,
            messageId: event.messageId,
          });
          break;
        case "status_change":
          await callbacks.onStatusChange?.(event.status, event.metadata);
          break;
      }

      if (shouldReconnect) {
        break;
      }
    }
  } while (!signal?.aborted && shouldReconnect);

  return conversationId && generationId ? { generationId, conversationId } : null;
}
