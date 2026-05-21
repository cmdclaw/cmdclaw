import type {
  RuntimeActionableEvent,
  RuntimeApprovalRequest,
  RuntimePermissionRequest,
  RuntimeQuestionRequest,
} from "../runtime-driver";
import type { RuntimeQuestionRequest as OpenCodeQuestionRequest } from "../../sandbox/core/types";
import type { RuntimeEvent } from "../../sandbox/core/types";
import {
  replyOpenCodePermissionRequest,
  replyOpenCodeQuestionRequest,
  rejectOpenCodeQuestionRequest,
  shouldAutoApproveOpenCodePermission,
  type OpenCodeApprovalCapableClient,
} from "./opencode-runtime-driver";

type OpenCodeActionableEvent = Extract<
  RuntimeEvent,
  { type: "message.part.updated" | "permission.asked" | "question.asked" }
>;

function normalizeQuestionRequest(request: OpenCodeQuestionRequest): RuntimeQuestionRequest {
  return {
    id: request.id,
    sessionId: request.sessionID,
    questions: request.questions.map((question) => ({
      header: question.header,
      question: question.question,
      options:
        question.options?.map((option) => ({
          label: option.label,
          description: option.description ?? option.value ?? "",
        })) ?? [],
      multiple: question.multiple,
      custom: question.custom,
    })),
    tool: request.tool
      ? {
          messageId: request.tool.messageID,
          callId: request.tool.callID ?? request.tool.callId,
        }
      : undefined,
  };
}

export async function normalizeOpenCodeActionableEvent(input: {
  event: OpenCodeActionableEvent;
  client: OpenCodeApprovalCapableClient;
  autoApprove: boolean;
  logAutoApprove?: (input: {
    requestId: string;
    permissionType: string;
    patterns?: string[];
    reason: "conversation_auto_approve" | "allowlisted_path";
  }) => void;
  logPermissionQueued?: (input: {
    requestId: string;
    permission?: string;
    patterns?: string[];
  }) => void;
  logPermissionApproveError?: (error: unknown) => void;
}): Promise<RuntimeActionableEvent> {
  switch (input.event.type) {
    case "message.part.updated":
      return { type: "none" };
    case "permission.asked": {
      const request: RuntimePermissionRequest = input.event.properties;
      const permissionType = request.permission || "file access";
      const patterns = request.patterns;
      const allPatternsAllowed = shouldAutoApproveOpenCodePermission(permissionType, patterns);

      if (input.autoApprove || allPatternsAllowed) {
        input.logAutoApprove?.({
          requestId: request.id,
          permissionType,
          patterns,
          reason: input.autoApprove ? "conversation_auto_approve" : "allowlisted_path",
        });
        try {
          await replyOpenCodePermissionRequest(input.client, {
            requestID: request.id,
            reply: "always",
          });
        } catch (error) {
          input.logPermissionApproveError?.(error);
        }
        return { type: "none" };
      }

      input.logPermissionQueued?.({
        requestId: request.id,
        permission: request.permission,
        patterns,
      });
      return {
        type: "permission",
        request,
      };
    }
    case "question.asked":
      return {
        type: "question",
        request: normalizeQuestionRequest(input.event.properties),
      };
  }
}

export async function sendOpenCodeRuntimeDecision(
  client: OpenCodeApprovalCapableClient,
  request: RuntimeApprovalRequest,
): Promise<void> {
  if (request.kind === "permission") {
    await replyOpenCodePermissionRequest(client, {
      requestID: request.requestId,
      reply: request.reply,
    });
    return;
  }

  if (request.reject) {
    await rejectOpenCodeQuestionRequest(client, {
      requestID: request.requestId,
    });
    return;
  }

  await replyOpenCodeQuestionRequest(client, {
    requestID: request.requestId,
    answers: request.answers ?? [],
  });
}
