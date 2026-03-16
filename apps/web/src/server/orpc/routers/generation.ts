import { parseModelReference } from "@cmdclaw/core/lib/model-reference";
import { generationManager } from "@cmdclaw/core/server/services/generation-manager";
import { listSelectablePlatformSkills } from "@cmdclaw/core/server/services/platform-skill-service";
import { createTraceId, logServerEvent } from "@cmdclaw/core/server/utils/observability";
import { db } from "@cmdclaw/db/client";
import { generation, conversation } from "@cmdclaw/db/schema";
import { eventIterator } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { detectMessageLanguage } from "@/server/utils/detect-message-language";
import { protectedProcedure } from "../middleware";

// Schema for generation events (same structure as GenerationEvent type)
const generationEventPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("system"),
    content: z.string(),
    coworkerId: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool_use"),
    toolName: z.string(),
    toolInput: z.unknown(),
    toolUseId: z.string().optional(),
    integration: z.string().optional(),
    operation: z.string().optional(),
    isWrite: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("tool_result"),
    toolName: z.string(),
    result: z.unknown(),
    toolUseId: z.string().optional(),
  }),
  z.object({
    type: z.literal("thinking"),
    content: z.string(),
    thinkingId: z.string(),
  }),
  z.object({
    type: z.literal("interrupt_pending"),
    interruptId: z.string(),
    generationId: z.string(),
    conversationId: z.string(),
    kind: z.enum(["plugin_write", "runtime_permission", "runtime_question", "auth"]),
    status: z.enum(["pending", "accepted", "rejected", "expired", "cancelled"]),
    providerToolUseId: z.string(),
    display: z.object({
      title: z.string(),
      integration: z.string().optional(),
      operation: z.string().optional(),
      command: z.string().optional(),
      toolInput: z.record(z.string(), z.unknown()).optional(),
      questionSpec: z
        .object({
          questions: z.array(
            z.object({
              header: z.string(),
              question: z.string(),
              options: z.array(
                z.object({
                  label: z.string(),
                  description: z.string().optional(),
                }),
              ),
              multiple: z.boolean().optional(),
              custom: z.boolean().optional(),
            }),
          ),
        })
        .optional(),
      authSpec: z
        .object({
          integrations: z.array(z.string()),
          reason: z.string().optional(),
        })
        .optional(),
    }),
    responsePayload: z
      .object({
        questionAnswers: z.array(z.array(z.string())).optional(),
        connectedIntegrations: z.array(z.string()).optional(),
        integration: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("interrupt_resolved"),
    interruptId: z.string(),
    generationId: z.string(),
    conversationId: z.string(),
    kind: z.enum(["plugin_write", "runtime_permission", "runtime_question", "auth"]),
    status: z.enum(["pending", "accepted", "rejected", "expired", "cancelled"]),
    providerToolUseId: z.string(),
    display: z.object({
      title: z.string(),
      integration: z.string().optional(),
      operation: z.string().optional(),
      command: z.string().optional(),
      toolInput: z.record(z.string(), z.unknown()).optional(),
      questionSpec: z
        .object({
          questions: z.array(
            z.object({
              header: z.string(),
              question: z.string(),
              options: z.array(
                z.object({
                  label: z.string(),
                  description: z.string().optional(),
                }),
              ),
              multiple: z.boolean().optional(),
              custom: z.boolean().optional(),
            }),
          ),
        })
        .optional(),
      authSpec: z
        .object({
          integrations: z.array(z.string()),
          reason: z.string().optional(),
        })
        .optional(),
    }),
    responsePayload: z
      .object({
        questionAnswers: z.array(z.array(z.string())).optional(),
        connectedIntegrations: z.array(z.string()).optional(),
        integration: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("done"),
    generationId: z.string(),
    conversationId: z.string(),
    messageId: z.string(),
    usage: z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalCostUsd: z.number(),
    }),
    artifacts: z
      .object({
        timing: z
          .object({
            sandboxStartupDurationMs: z.number().optional(),
            sandboxStartupMode: z.enum(["created", "reused", "unknown"]).optional(),
            generationDurationMs: z.number().optional(),
            phaseDurationsMs: z
              .object({
                sandboxConnectOrCreateMs: z.number().optional(),
                opencodeReadyMs: z.number().optional(),
                sessionReadyMs: z.number().optional(),
                agentInitMs: z.number().optional(),
                prePromptSetupMs: z.number().optional(),
                agentReadyToPromptMs: z.number().optional(),
                waitForFirstEventMs: z.number().optional(),
                promptToFirstTokenMs: z.number().optional(),
                generationToFirstTokenMs: z.number().optional(),
                promptToFirstVisibleOutputMs: z.number().optional(),
                generationToFirstVisibleOutputMs: z.number().optional(),
                modelStreamMs: z.number().optional(),
                postProcessingMs: z.number().optional(),
              })
              .optional(),
            phaseTimestamps: z
              .array(
                z.object({
                  phase: z.string(),
                  at: z.string(),
                  elapsedMs: z.number(),
                }),
              )
              .optional(),
          })
          .optional(),
        attachments: z.array(
          z.object({
            id: z.string(),
            filename: z.string(),
            mimeType: z.string(),
            sizeBytes: z.number(),
          }),
        ),
        sandboxFiles: z.array(
          z.object({
            fileId: z.string(),
            path: z.string(),
            filename: z.string(),
            mimeType: z.string(),
            sizeBytes: z.number().nullable(),
          }),
        ),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("cancelled"),
    generationId: z.string(),
    conversationId: z.string(),
    messageId: z.string().optional(),
  }),
  z.object({
    type: z.literal("status_change"),
    status: z.string(),
    metadata: z
      .object({
        sandboxProvider: z.enum(["e2b", "daytona", "docker"]).optional(),
        runtimeHarness: z.enum(["opencode", "agent-sdk"]).optional(),
        runtimeProtocolVersion: z.enum(["opencode-v2", "sandbox-agent-v1"]).optional(),
        sandboxId: z.string().optional(),
        sessionId: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("sandbox_file"),
    fileId: z.string(),
    path: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().nullable(),
  }),
]);
const generationEventSchema = z.intersection(
  z.object({
    cursor: z.string().optional(),
  }),
  generationEventPayloadSchema,
);

// Start a new generation (returns immediately with generationId)
const modelReferenceSchema = z
  .string()
  .min(3)
  .refine((value) => {
    try {
      parseModelReference(value);
      return true;
    } catch {
      return false;
    }
  }, "Model must use provider/model format");

const startGeneration = protectedProcedure
  .input(
    z.object({
      conversationId: z.string().optional(),
      content: z.string().min(1).max(100000),
      model: modelReferenceSchema.optional(),
      autoApprove: z.boolean().optional(),
      sandboxProvider: z.enum(["e2b", "daytona", "docker"]).optional(),
      selectedPlatformSkillSlugs: z.array(z.string().max(128)).max(50).optional(),
      fileAttachments: z
        .array(
          z.object({
            name: z.string(),
            mimeType: z.string(),
            dataUrl: z.string(),
          }),
        )
        .optional(),
    }),
  )
  .output(
    z.object({
      generationId: z.string(),
      conversationId: z.string(),
    }),
  )
  .handler(async ({ input, context }) => {
    const startedAt = Date.now();
    const logContext = {
      source: "rpc",
      route: "/api/rpc/generation/startGeneration",
      rpcProcedure: "generation.startGeneration",
      userId: context.user.id,
    };

    try {
      const result = await generationManager.startGeneration({
        conversationId: input.conversationId,
        content: input.content,
        model: input.model,
        userId: context.user.id,
        autoApprove: input.autoApprove,
        sandboxProvider: input.sandboxProvider,
        selectedPlatformSkillSlugs: input.selectedPlatformSkillSlugs,
        fileAttachments: input.fileAttachments,
      });

      const successLogContext = {
        ...logContext,
        generationId: result.generationId,
        conversationId: result.conversationId,
      };
      logServerEvent(
        "info",
        "RPC_START_GENERATION_OK",
        {
          elapsedMs: Date.now() - startedAt,
        },
        successLogContext,
      );

      return result;
    } catch (error) {
      logServerEvent(
        "error",
        "RPC_START_GENERATION_FAILED",
        {
          elapsedMs: Date.now() - startedAt,
          conversationId: input.conversationId,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        },
        logContext,
      );
      throw error;
    }
  });

const enqueueConversationMessage = protectedProcedure
  .input(
    z.object({
      conversationId: z.string(),
      content: z.string().min(1).max(100000),
      selectedPlatformSkillSlugs: z.array(z.string().max(128)).max(50).optional(),
      fileAttachments: z
        .array(
          z.object({
            name: z.string(),
            mimeType: z.string(),
            dataUrl: z.string(),
          }),
        )
        .optional(),
      replaceExisting: z.boolean().optional(),
    }),
  )
  .output(
    z.object({
      queuedMessageId: z.string(),
    }),
  )
  .handler(async ({ input, context }) => {
    return generationManager.enqueueConversationMessage({
      conversationId: input.conversationId,
      userId: context.user.id,
      content: input.content,
      fileAttachments: input.fileAttachments,
      selectedPlatformSkillSlugs: input.selectedPlatformSkillSlugs,
      replaceExisting: input.replaceExisting,
    });
  });

const listConversationQueuedMessages = protectedProcedure
  .input(
    z.object({
      conversationId: z.string(),
    }),
  )
  .output(
    z.array(
      z.object({
        id: z.string(),
        content: z.string(),
        fileAttachments: z
          .array(
            z.object({
              name: z.string(),
              mimeType: z.string(),
              dataUrl: z.string(),
            }),
          )
          .optional(),
        selectedPlatformSkillSlugs: z.array(z.string()).optional(),
        status: z.enum(["queued", "processing"]),
        createdAt: z.string(),
      }),
    ),
  )
  .handler(async ({ input, context }) => {
    let queued;
    try {
      queued = await generationManager.listConversationQueuedMessages(
        input.conversationId,
        context.user.id,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Conversation not found") {
        return [];
      }
      throw error;
    }
    return queued.map((item) => ({
      id: item.id,
      content: item.content,
      fileAttachments: item.fileAttachments,
      selectedPlatformSkillSlugs: item.selectedPlatformSkillSlugs,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
    }));
  });

const removeConversationQueuedMessage = protectedProcedure
  .input(
    z.object({
      queuedMessageId: z.string(),
      conversationId: z.string(),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const success = await generationManager.removeConversationQueuedMessage(
      input.queuedMessageId,
      input.conversationId,
      context.user.id,
    );
    return { success };
  });

const listPlatformSkills = protectedProcedure
  .output(
    z.array(
      z.object({
        slug: z.string(),
        title: z.string(),
        description: z.string(),
      }),
    ),
  )
  .handler(async () => {
    return await listSelectablePlatformSkills();
  });

const detectUserMessageLanguage = protectedProcedure
  .input(
    z.object({
      text: z.string().min(1).max(10000),
    }),
  )
  .output(
    z.object({
      language: z.enum(["french", "other"]),
    }),
  )
  .handler(async ({ input }) => {
    const language = await detectMessageLanguage(input.text);
    return { language };
  });

// Subscribe to generation stream (can be called multiple times, from multiple clients)
const subscribeGeneration = protectedProcedure
  .input(
    z.object({
      generationId: z.string(),
      cursor: z.string().optional(),
    }),
  )
  .output(eventIterator(generationEventSchema))
  .handler(async function* ({ input, context }) {
    const streamId = createTraceId();
    const openedAt = Date.now();
    const logContext = {
      source: "rpc",
      route: "/api/rpc/generation/subscribeGeneration",
      rpcProcedure: "generation.subscribeGeneration",
      generationId: input.generationId,
      userId: context.user.id,
      traceId: streamId,
    };
    logServerEvent(
      "info",
      "RPC_SUBSCRIBE_GENERATION_OPENED",
      generationManager.getStreamCountersSnapshot(),
      logContext,
    );

    const stream = generationManager.subscribeToGeneration(input.generationId, context.user.id, {
      cursor: input.cursor,
    });

    try {
      for await (const event of stream) {
        yield event;
      }
    } finally {
      logServerEvent(
        "info",
        "RPC_SUBSCRIBE_GENERATION_CLOSED",
        {
          elapsedMs: Date.now() - openedAt,
          ...generationManager.getStreamCountersSnapshot(),
        },
        logContext,
      );
    }
  });

// Cancel a generation
const cancelGeneration = protectedProcedure
  .input(
    z.object({
      generationId: z.string(),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const success = await generationManager.cancelGeneration(input.generationId, context.user.id);
    return { success };
  });

// Resume a paused generation (after approval timeout)
const resumeGeneration = protectedProcedure
  .input(
    z.object({
      generationId: z.string(),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const success = await generationManager.resumeGeneration(input.generationId, context.user.id);
    return { success };
  });

// Submit approval decision
const submitApproval = protectedProcedure
  .input(
    z.object({
      generationId: z.string(),
      toolUseId: z.string(),
      decision: z.enum(["approve", "deny"]),
      questionAnswers: z.array(z.array(z.string())).optional(),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const success = await generationManager.submitApproval(
      input.generationId,
      input.toolUseId,
      input.decision,
      context.user.id,
      input.questionAnswers,
    );
    return { success };
  });

// Submit auth result (after OAuth completes)
const submitAuthResult = protectedProcedure
  .input(
    z.object({
      generationId: z.string(),
      integration: z.string(),
      success: z.boolean(),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const success = await generationManager.submitAuthResult(
      input.generationId,
      input.integration,
      input.success,
      context.user.id,
    );
    return { success };
  });

// Get generation status (for polling fallback)
const getGenerationStatus = protectedProcedure
  .input(
    z.object({
      generationId: z.string(),
    }),
  )
  .output(
    z
      .object({
        status: z.enum([
          "running",
          "awaiting_approval",
          "awaiting_auth",
          "paused",
          "completed",
          "cancelled",
          "error",
        ]),
        contentParts: z.array(z.unknown()),
        pendingApproval: z
          .object({
            toolUseId: z.string(),
            toolName: z.string(),
            toolInput: z.unknown(),
            requestedAt: z.string(),
          })
          .nullable(),
        usage: z.object({
          inputTokens: z.number(),
          outputTokens: z.number(),
        }),
      })
      .nullable(),
  )
  .handler(async ({ input, context }) => {
    // First check if user has access
    const genRecord = await db.query.generation.findFirst({
      where: eq(generation.id, input.generationId),
      with: { conversation: true },
    });

    if (!genRecord) {
      return null;
    }

    if (genRecord.conversation.userId !== context.user.id) {
      throw new Error("Access denied");
    }

    const status = await generationManager.getGenerationStatus(input.generationId);
    return status;
  });

// Get active generation for a conversation
const getActiveGeneration = protectedProcedure
  .input(
    z.object({
      conversationId: z.string(),
    }),
  )
  .output(
    z.object({
      generationId: z.string().nullable(),
      startedAt: z.string().nullable(),
      errorMessage: z.string().nullable(),
      status: z
        .enum([
          "idle",
          "generating",
          "awaiting_approval",
          "awaiting_auth",
          "paused",
          "complete",
          "error",
        ])
        .nullable(),
    }),
  )
  .handler(async ({ input, context }) => {
    // Check conversation access
    const conv = await db.query.conversation.findFirst({
      where: eq(conversation.id, input.conversationId),
    });

    if (!conv) {
      return {
        generationId: null,
        startedAt: null,
        errorMessage: null,
        status: null,
      };
    }

    if (conv.userId !== context.user.id) {
      throw new Error("Access denied");
    }

    let startedAt: string | null = null;
    let errorMessage: string | null = null;
    if (conv.currentGenerationId) {
      const currentGeneration = await db.query.generation.findFirst({
        where: eq(generation.id, conv.currentGenerationId),
        columns: {
          startedAt: true,
          errorMessage: true,
        },
      });
      startedAt = currentGeneration?.startedAt?.toISOString() ?? null;
      errorMessage = currentGeneration?.errorMessage ?? null;
    }

    return {
      generationId: conv.currentGenerationId,
      startedAt,
      errorMessage,
      status: conv.generationStatus,
    };
  });

export const generationRouter = {
  startGeneration,
  enqueueConversationMessage,
  listConversationQueuedMessages,
  removeConversationQueuedMessage,
  subscribeGeneration,
  cancelGeneration,
  resumeGeneration,
  submitApproval,
  submitAuthResult,
  listPlatformSkills,
  detectUserMessageLanguage,
  getGenerationStatus,
  getActiveGeneration,
};
