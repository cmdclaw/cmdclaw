import { generationManager } from "@cmdclaw/core/server/services/generation-manager";
import {
  conversation,
  coworkerRun,
  coworkerRunEvent,
  generation,
  generationInterrupt,
  inboxReadState,
} from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../middleware";
import { requireActiveWorkspaceAccess } from "../workspace-access";

const inboxStatusSchema = z.enum(["awaiting_approval", "awaiting_auth", "error"]);
const inboxTypeSchema = z.enum(["all", "coworkers", "chats"]);

type InboxStatus = z.infer<typeof inboxStatusSchema>;

type InboxPendingApproval = {
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
  integration: string;
  operation: string;
  command?: string;
};

type InboxPendingAuth = {
  integrations: string[];
  connectedIntegrations: string[];
  reason?: string;
};

type InboxListItem =
  | {
      kind: "coworker";
      id: string;
      runId: string;
      coworkerId: string;
      coworkerName: string;
      builderAvailable: boolean;
      title: string;
      status: InboxStatus;
      updatedAt: Date;
      createdAt: Date;
      generationId: string | null;
      conversationId: string | null;
      errorMessage: string | null;
      pendingApproval?: InboxPendingApproval;
      pendingAuth?: InboxPendingAuth;
    }
  | {
      kind: "chat";
      id: string;
      conversationId: string;
      conversationTitle: string;
      title: string;
      status: InboxStatus;
      updatedAt: Date;
      createdAt: Date;
      generationId: string | null;
      errorMessage: string | null;
      pendingApproval?: InboxPendingApproval;
      pendingAuth?: InboxPendingAuth;
    };

type InboxSourceOption = {
  coworkerId: string;
  coworkerName: string;
};

function formatCoworkerTitle(coworkerName: string, startedAt: Date): string {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(startedAt);
  return `${coworkerName} · ${formattedDate}`;
}

function normalizePendingApproval(
  interrupt:
    | {
        providerToolUseId: string;
        display: {
          title: string;
          integration?: string;
          operation?: string;
          command?: string;
          toolInput?: Record<string, unknown>;
        };
      }
    | undefined,
): InboxPendingApproval | undefined {
  if (!interrupt) {
    return undefined;
  }

  return {
    toolUseId: interrupt.providerToolUseId,
    toolName: interrupt.display.title,
    toolInput: interrupt.display.toolInput ?? {},
    integration: interrupt.display.integration ?? "cmdclaw",
    operation: interrupt.display.operation ?? "unknown",
    command: interrupt.display.command,
  };
}

function normalizePendingAuth(
  interrupt:
    | {
        display: {
          authSpec?: {
            integrations: string[];
            reason?: string;
          };
        };
        responsePayload?: {
          connectedIntegrations?: string[];
        } | null;
      }
    | undefined,
): InboxPendingAuth | undefined {
  const authSpec = interrupt?.display.authSpec;
  if (!authSpec) {
    return undefined;
  }

  return {
    integrations: authSpec.integrations,
    connectedIntegrations: interrupt?.responsePayload?.connectedIntegrations ?? [],
    reason: authSpec.reason,
  };
}

function buildEditedApprovalMessage(args: {
  toolName: string;
  integration: string;
  operation: string;
  originalToolInput: unknown;
  updatedToolInput: unknown;
}): string {
  return [
    "The previous approval request was denied because the user changed the requested action.",
    "",
    `Original tool: ${args.toolName}`,
    `Integration: ${args.integration}`,
    `Operation: ${args.operation}`,
    "",
    "Original request:",
    "```json",
    JSON.stringify(args.originalToolInput ?? {}, null, 2),
    "```",
    "",
    "Updated request:",
    "```json",
    JSON.stringify(args.updatedToolInput ?? {}, null, 2),
    "```",
    "",
    "Please continue with the updated action instead of the previous request.",
  ].join("\n");
}

async function requireConversationAccessInActiveWorkspace(args: {
  context: {
    user: { id: string };
    db: typeof import("@cmdclaw/db/client").db;
  };
  conversationId: string;
  workspaceId: string;
}) {
  const conv = await args.context.db.query.conversation.findFirst({
    where: and(
      eq(conversation.id, args.conversationId),
      eq(conversation.userId, args.context.user.id),
      eq(conversation.workspaceId, args.workspaceId),
    ),
    columns: {
      id: true,
      type: true,
      title: true,
    },
  });

  if (!conv) {
    throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
  }

  return conv;
}

async function requireGenerationAccessInActiveWorkspace(args: {
  context: {
    user: { id: string };
    db: typeof import("@cmdclaw/db/client").db;
  };
  generationId: string;
  workspaceId: string;
}) {
  const gen = await args.context.db.query.generation.findFirst({
    where: eq(generation.id, args.generationId),
    with: {
      conversation: {
        columns: {
          id: true,
          userId: true,
          workspaceId: true,
          type: true,
        },
      },
    },
  });

  if (
    !gen ||
    !gen.conversation ||
    gen.conversation.userId !== args.context.user.id ||
    gen.conversation.workspaceId !== args.workspaceId
  ) {
    throw new ORPCError("NOT_FOUND", { message: "Generation not found" });
  }

  return gen;
}

const list = protectedProcedure
  .input(
    z.object({
      limit: z.number().int().min(1).max(20).default(20),
      type: inboxTypeSchema.default("all"),
      statuses: z.array(inboxStatusSchema).default([]),
      sourceCoworkerId: z.string().optional(),
      query: z.string().default(""),
    }),
  )
  .handler(
    async ({
      input,
      context,
    }): Promise<{ items: InboxListItem[]; sourceOptions: InboxSourceOption[] }> => {
      const {
        workspace: { id: workspaceId },
      } = await requireActiveWorkspaceAccess(context.user.id);
      const statuses = input.statuses.length > 0 ? input.statuses : inboxStatusSchema.options;

      const coworkerFilters = [
        eq(coworkerRun.ownerId, context.user.id),
        eq(coworkerRun.workspaceId, workspaceId),
        inArray(coworkerRun.status, statuses),
      ];
      if (input.sourceCoworkerId && input.type !== "chats") {
        coworkerFilters.push(eq(coworkerRun.coworkerId, input.sourceCoworkerId));
      }

      const coworkerRuns =
        input.type === "chats"
          ? []
          : await context.db.query.coworkerRun.findMany({
              where: and(...coworkerFilters),
              orderBy: (run, { desc: orderDesc }) => [orderDesc(run.startedAt)],
              with: {
                coworker: {
                  columns: {
                    id: true,
                    name: true,
                  },
                },
                generation: {
                  columns: {
                    id: true,
                    conversationId: true,
                  },
                },
                events: {
                  columns: {
                    createdAt: true,
                  },
                  orderBy: (event, { desc: orderDesc }) => [orderDesc(event.createdAt)],
                  limit: 1,
                },
              },
            });

      const chatConversations =
        input.type === "coworkers"
          ? []
          : await context.db.query.conversation.findMany({
              where: and(
                eq(conversation.userId, context.user.id),
                eq(conversation.workspaceId, workspaceId),
                eq(conversation.type, "chat"),
                inArray(conversation.generationStatus, statuses),
                isNull(conversation.archivedAt),
              ),
              columns: {
                id: true,
                title: true,
                createdAt: true,
                updatedAt: true,
                currentGenerationId: true,
                generationStatus: true,
              },
            });

      const generationIds = new Set<string>();
      for (const run of coworkerRuns) {
        if (run.generationId) {
          generationIds.add(run.generationId);
        }
      }
      for (const conv of chatConversations) {
        if (conv.currentGenerationId) {
          generationIds.add(conv.currentGenerationId);
        }
      }

      const generationIdList = [...generationIds];
      const pendingInterrupts =
        generationIdList.length === 0
          ? []
          : await context.db.query.generationInterrupt.findMany({
              where: and(
                inArray(generationInterrupt.generationId, generationIdList),
                eq(generationInterrupt.status, "pending"),
              ),
              orderBy: (interrupt, { desc: orderDesc }) => [orderDesc(interrupt.requestedAt)],
              columns: {
                generationId: true,
                kind: true,
                providerToolUseId: true,
                display: true,
                responsePayload: true,
              },
            });

      const chatGenerations =
        generationIdList.length === 0
          ? []
          : await context.db.query.generation.findMany({
              where: inArray(generation.id, generationIdList),
              columns: {
                id: true,
                errorMessage: true,
              },
            });

      const interruptByGenerationId = new Map<string, (typeof pendingInterrupts)[number]>();
      for (const interrupt of pendingInterrupts) {
        if (!interruptByGenerationId.has(interrupt.generationId)) {
          interruptByGenerationId.set(interrupt.generationId, interrupt);
        }
      }

      const generationById = new Map(chatGenerations.map((item) => [item.id, item]));

      const sourceOptions = [
        ...new Map(
          coworkerRuns.map((run) => [
            run.coworkerId,
            {
              coworkerId: run.coworkerId,
              coworkerName: run.coworker?.name ?? "Coworker",
            },
          ]),
        ).values(),
      ].toSorted((a, b) => a.coworkerName.localeCompare(b.coworkerName));

      const items: InboxListItem[] = [];

      for (const run of coworkerRuns) {
        const interrupt = run.generationId
          ? interruptByGenerationId.get(run.generationId)
          : undefined;
        const updatedAt = run.events[0]?.createdAt ?? run.finishedAt ?? run.startedAt;
        items.push({
          kind: "coworker",
          id: run.id,
          runId: run.id,
          coworkerId: run.coworkerId,
          coworkerName: run.coworker?.name ?? "Coworker",
          builderAvailable: true,
          title: formatCoworkerTitle(run.coworker?.name ?? "Coworker", run.startedAt),
          status: run.status as InboxStatus,
          updatedAt,
          createdAt: run.startedAt,
          generationId: run.generationId,
          conversationId: run.generation?.conversationId ?? null,
          errorMessage: run.errorMessage ?? null,
          pendingApproval:
            run.status === "awaiting_approval" && interrupt?.kind !== "auth"
              ? normalizePendingApproval(interrupt)
              : undefined,
          pendingAuth:
            run.status === "awaiting_auth" && interrupt?.kind === "auth"
              ? normalizePendingAuth(interrupt)
              : undefined,
        });
      }

      for (const conv of chatConversations) {
        const interrupt = conv.currentGenerationId
          ? interruptByGenerationId.get(conv.currentGenerationId)
          : undefined;
        const generationRecord = conv.currentGenerationId
          ? generationById.get(conv.currentGenerationId)
          : undefined;

        items.push({
          kind: "chat",
          id: conv.id,
          conversationId: conv.id,
          conversationTitle: conv.title ?? "New conversation",
          title: conv.title ?? "New conversation",
          status: conv.generationStatus as InboxStatus,
          updatedAt: conv.updatedAt,
          createdAt: conv.createdAt,
          generationId: conv.currentGenerationId,
          errorMessage: generationRecord?.errorMessage ?? null,
          pendingApproval:
            conv.generationStatus === "awaiting_approval" && interrupt?.kind !== "auth"
              ? normalizePendingApproval(interrupt)
              : undefined,
          pendingAuth:
            conv.generationStatus === "awaiting_auth" && interrupt?.kind === "auth"
              ? normalizePendingAuth(interrupt)
              : undefined,
        });
      }

      const readStates =
        items.length === 0
          ? []
          : await context.db.query.inboxReadState.findMany({
              where: and(
                eq(inboxReadState.userId, context.user.id),
                eq(inboxReadState.workspaceId, workspaceId),
                inArray(
                  inboxReadState.itemId,
                  items.map((item) => item.id),
                ),
              ),
              columns: {
                itemKind: true,
                itemId: true,
                readAt: true,
              },
            });
      const readStateByItemKey = new Map(
        readStates.map((state) => [`${state.itemKind}:${state.itemId}`, state]),
      );
      const unreadItems = items.filter((item) => {
        const state = readStateByItemKey.get(`${item.kind}:${item.id}`);
        return !state || state.readAt.getTime() < item.updatedAt.getTime();
      });

      const normalizedQuery = input.query.trim().toLowerCase();
      const filteredItems = normalizedQuery
        ? unreadItems.filter((item) => {
            const haystack = [
              item.title,
              item.kind === "coworker" ? item.coworkerName : item.conversationTitle,
              item.errorMessage ?? "",
            ]
              .join(" ")
              .toLowerCase();
            return haystack.includes(normalizedQuery);
          })
        : unreadItems;

      filteredItems.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

      return {
        items: filteredItems.slice(0, input.limit),
        sourceOptions,
      };
    },
  );

const markAsRead = protectedProcedure
  .input(
    z.object({
      kind: z.enum(["coworker", "chat"]),
      id: z.string(),
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    if (input.kind === "chat") {
      const conv = await context.db.query.conversation.findFirst({
        where: and(
          eq(conversation.id, input.id),
          eq(conversation.userId, context.user.id),
          eq(conversation.workspaceId, workspaceId),
          eq(conversation.type, "chat"),
        ),
        columns: {
          id: true,
        },
      });

      if (!conv) {
        throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
      }
    } else {
      const run = await context.db.query.coworkerRun.findFirst({
        where: and(
          eq(coworkerRun.id, input.id),
          eq(coworkerRun.ownerId, context.user.id),
          eq(coworkerRun.workspaceId, workspaceId),
        ),
        columns: {
          id: true,
        },
      });

      if (!run) {
        throw new ORPCError("NOT_FOUND", { message: "Coworker run not found" });
      }
    }

    const now = new Date();
    await context.db
      .insert(inboxReadState)
      .values({
        userId: context.user.id,
        workspaceId,
        itemKind: input.kind,
        itemId: input.id,
        readAt: now,
      })
      .onConflictDoUpdate({
        target: [
          inboxReadState.userId,
          inboxReadState.workspaceId,
          inboxReadState.itemKind,
          inboxReadState.itemId,
        ],
        set: {
          readAt: now,
          updatedAt: now,
        },
      });

    return { success: true };
  });

const editApprovalAndResend = protectedProcedure
  .input(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("chat"),
        generationId: z.string(),
        toolUseId: z.string(),
        updatedToolInput: z.unknown(),
        conversationId: z.string(),
      }),
      z.object({
        kind: z.literal("coworker"),
        generationId: z.string(),
        toolUseId: z.string(),
        updatedToolInput: z.unknown(),
        conversationId: z.string(),
        runId: z.string(),
      }),
    ]),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    const gen = await requireGenerationAccessInActiveWorkspace({
      context,
      generationId: input.generationId,
      workspaceId,
    });

    const conv = await requireConversationAccessInActiveWorkspace({
      context,
      conversationId: input.conversationId,
      workspaceId,
    });

    if (gen.conversationId !== conv.id) {
      throw new ORPCError("BAD_REQUEST", { message: "Generation does not belong to conversation" });
    }

    const interrupt = await context.db.query.generationInterrupt.findFirst({
      where: and(
        eq(generationInterrupt.generationId, input.generationId),
        eq(generationInterrupt.providerToolUseId, input.toolUseId),
        eq(generationInterrupt.status, "pending"),
      ),
      orderBy: (item, { desc: orderDesc }) => [orderDesc(item.requestedAt)],
      columns: {
        id: true,
        kind: true,
        providerToolUseId: true,
        display: true,
      },
    });

    if (!interrupt || interrupt.kind === "auth") {
      throw new ORPCError("BAD_REQUEST", { message: "Pending approval not found" });
    }

    const denied = await generationManager.submitApproval(
      input.generationId,
      input.toolUseId,
      "deny",
      context.user.id,
    );
    if (!denied) {
      throw new ORPCError("BAD_REQUEST", { message: "Failed to deny pending approval" });
    }

    const userMessage = buildEditedApprovalMessage({
      toolName: interrupt.display.title,
      integration: interrupt.display.integration ?? "cmdclaw",
      operation: interrupt.display.operation ?? "unknown",
      originalToolInput: interrupt.display.toolInput ?? {},
      updatedToolInput: input.updatedToolInput,
    });

    await generationManager.enqueueConversationMessage({
      conversationId: input.conversationId,
      userId: context.user.id,
      content: userMessage,
      replaceExisting: false,
    });

    if (input.kind === "coworker") {
      const run = await context.db.query.coworkerRun.findFirst({
        where: and(
          eq(coworkerRun.id, input.runId),
          eq(coworkerRun.ownerId, context.user.id),
          eq(coworkerRun.workspaceId, workspaceId),
        ),
        columns: {
          id: true,
          generationId: true,
        },
      });

      if (!run || run.generationId !== input.generationId) {
        throw new ORPCError("NOT_FOUND", { message: "Coworker run not found" });
      }

      await context.db.insert(coworkerRunEvent).values({
        coworkerRunId: run.id,
        type: "user_interrupt",
        payload: {
          source: "edited_approval",
          message: userMessage,
          toolUseId: interrupt.providerToolUseId,
          toolName: interrupt.display.title,
          integration: interrupt.display.integration ?? "cmdclaw",
          operation: interrupt.display.operation ?? "unknown",
          command: interrupt.display.command,
          originalToolInput: interrupt.display.toolInput ?? {},
          updatedToolInput: input.updatedToolInput,
        },
      });
    }

    return { success: true };
  });

export const inboxRouter = {
  list,
  markAsRead,
  editApprovalAndResend,
};
