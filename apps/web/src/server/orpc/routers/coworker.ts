import { DEFAULT_CONNECTED_CHATGPT_MODEL } from "@cmdclaw/core/lib/chat-model-defaults";
import { isAdminOnlyChatModel } from "@cmdclaw/core/lib/chat-model-policy";
import {
  COWORKER_AVAILABLE_INTEGRATION_TYPES,
  COWORKER_TOOL_ACCESS_MODES,
  normalizeCoworkerAllowedSkillSlugs,
  normalizeCoworkerToolAccessMode,
  type CoworkerToolAccessMode,
} from "@cmdclaw/core/lib/coworker-tool-policy";
import {
  buildCoworkerForwardingAddress,
  EMAIL_FORWARDED_TRIGGER_TYPE,
  generateCoworkerAliasLocalPart,
} from "@cmdclaw/core/lib/email-forwarding";
import { parseModelReference } from "@cmdclaw/core/lib/model-reference";
import {
  normalizeModelAuthSource,
  providerSupportsAuthSource,
  type ProviderAuthSource,
} from "@cmdclaw/core/lib/provider-auth-source";
import {
  listConfiguredRemoteIntegrationTargets,
  remoteIntegrationSourceSchema,
  remoteIntegrationTargetEnvSchema,
  searchRemoteIntegrationUsers,
} from "@cmdclaw/core/server/integrations/remote-integrations";
import {
  applyCoworkerEdit,
  coworkerBuilderEditSchema,
} from "@cmdclaw/core/server/services/coworker-builder-service";
import {
  generateCoworkerMetadataOnFirstPromptFill,
  normalizeAndEnsureUniqueCoworkerUsername,
} from "@cmdclaw/core/server/services/coworker-metadata";
import {
  removeCoworkerScheduleJob,
  syncCoworkerScheduleJob,
} from "@cmdclaw/core/server/services/coworker-scheduler";
import {
  reconcileStaleCoworkerRunsForCoworker,
  reconcileStaleCoworkerRunsForCoworkers,
  triggerCoworkerRun,
} from "@cmdclaw/core/server/services/coworker-service";
import { downloadFromS3 } from "@cmdclaw/core/server/storage/s3-client";
import {
  conversation,
  generation,
  user,
  coworker,
  coworkerDocument,
  coworkerEmailAlias,
  coworkerRun,
  coworkerRunEvent,
} from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  deleteCoworkerDocument,
  uploadCoworkerDocument,
} from "@/server/services/coworker-document";
import { protectedProcedure } from "../middleware";
import { requireActiveWorkspaceAccess, requireActiveWorkspaceAdmin } from "../workspace-access";

const integrationTypeSchema = z.enum([
  "google_gmail",
  "outlook",
  "outlook_calendar",
  "google_calendar",
  "google_docs",
  "google_sheets",
  "google_drive",
  "notion",
  "linear",
  "github",
  "airtable",
  "slack",
  "hubspot",
  "linkedin",
  "salesforce",
  "dynamics",
  "reddit",
  "twitter",
]);
const DEFAULT_COWORKER_INTEGRATIONS = [...COWORKER_AVAILABLE_INTEGRATION_TYPES];
const toolAccessModeSchema = z.enum(COWORKER_TOOL_ACCESS_MODES);
const providerAuthSourceSchema = z.enum(["user", "shared"]);
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

const triggerTypeSchema = z.string().min(1).max(128);
const COWORKER_ALIAS_GENERATION_MAX_ATTEMPTS = 32;

function assertModelAllowedForRole(model: string, role: string | null | undefined): void {
  if (isAdminOnlyChatModel(model) && role !== "admin") {
    throw new ORPCError("FORBIDDEN", {
      message: "Claude Sonnet 4.6 is only available to admins.",
    });
  }
}

function getReceivingDomain(): string | null {
  const value = process.env.RESEND_RECEIVING_DOMAIN?.trim().toLowerCase();
  return value && value.length > 0 ? value : null;
}

function resolveCoworkerAuthSource(
  model: string,
  authSource?: ProviderAuthSource | null,
): ProviderAuthSource | null {
  const { providerID } = parseModelReference(model);
  if (authSource && !providerSupportsAuthSource(providerID, authSource)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Model provider "${providerID}" does not support auth source "${authSource}".`,
    });
  }
  return normalizeModelAuthSource({
    model,
    authSource,
  });
}

function normalizeDescriptionInput(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCoworkerInstructionInput(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveCoworkerUsername(params: {
  database: unknown;
  coworkerId: string;
  username: string | null | undefined;
}): Promise<string | null> {
  if (typeof params.username !== "string") {
    return null;
  }

  const trimmed = params.username.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = await normalizeAndEnsureUniqueCoworkerUsername({
    database: params.database as {
      query: { coworker: { findFirst: (args: unknown) => Promise<unknown> } };
    },
    coworkerId: params.coworkerId,
    username: trimmed,
  });

  if (!normalized) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Username must contain letters, numbers, or hyphens",
    });
  }

  return normalized;
}

async function requireOwnedCoworkerInActiveWorkspace(
  context: {
    user: { id: string };
    db: typeof import("@cmdclaw/db/client").db;
  },
  coworkerId: string,
) {
  const access = await requireActiveWorkspaceAccess(context.user.id);
  const workspaceId = access.workspace.id;
  const coworkerRow = await context.db.query.coworker.findFirst({
    where: and(
      eq(coworker.id, coworkerId),
      eq(coworker.ownerId, context.user.id),
      eq(coworker.workspaceId, workspaceId),
    ),
  });

  if (!coworkerRow) {
    throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
  }

  return {
    coworker: coworkerRow,
    workspaceId,
    membershipRole: access.membership.role,
  };
}

async function requireAdminUser(context: {
  user: { id: string };
  db: typeof import("@cmdclaw/db/client").db;
}) {
  const dbUser = await context.db.query.user.findFirst({
    where: eq(user.id, context.user.id),
    columns: {
      role: true,
      email: true,
    },
  });

  if (dbUser?.role !== "admin") {
    throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
  }

  return dbUser;
}

async function copyCoworkerDocuments(params: {
  context: {
    user: { id: string };
    db: typeof import("@cmdclaw/db/client").db;
  };
  sourceCoworkerId: string;
  targetCoworkerId: string;
  targetUserId: string;
}) {
  const documents = await params.context.db.query.coworkerDocument.findMany({
    where: eq(coworkerDocument.coworkerId, params.sourceCoworkerId),
    orderBy: (document, { asc }) => [asc(document.createdAt)],
  });

  await Promise.all(
    documents.map(async (document) => {
      const contentBase64 = (await downloadFromS3(document.storageKey)).toString("base64");
      await uploadCoworkerDocument({
        database: params.context.db as typeof import("@cmdclaw/db/client").db,
        userId: params.targetUserId,
        coworkerId: params.targetCoworkerId,
        filename: document.filename,
        mimeType: document.mimeType,
        contentBase64,
        description: document.description ?? undefined,
      });
    }),
  );
}

// Schedule configuration schema
const scheduleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("interval"),
    intervalMinutes: z.number().min(60).max(10080), // min 1 hour, max 1 week in minutes
  }),
  z.object({
    type: z.literal("daily"),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), // HH:MM format
    timezone: z.string().default("UTC"),
  }),
  z.object({
    type: z.literal("weekly"),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    daysOfWeek: z.array(z.number().min(0).max(6)).min(1), // 0=Sunday, 6=Saturday
    timezone: z.string().default("UTC"),
  }),
  z.object({
    type: z.literal("monthly"),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    dayOfMonth: z.number().min(1).max(31),
    timezone: z.string().default("UTC"),
  }),
]);

const coworkerDefinitionDocumentSchema = z.object({
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(255),
  description: z.string().max(2000).nullish(),
  contentBase64: z.string().min(1),
});

const coworkerDefinitionSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  coworker: z.object({
    name: z.string().max(128),
    description: z.string().max(280).nullable(),
    username: z.string().max(128).nullable(),
    status: z.enum(["on", "off"]),
    triggerType: triggerTypeSchema,
    prompt: z.string().max(20000),
    model: modelReferenceSchema,
    authSource: providerAuthSourceSchema.nullable(),
    promptDo: z.string().max(2000).nullable(),
    promptDont: z.string().max(2000).nullable(),
    autoApprove: z.boolean(),
    toolAccessMode: toolAccessModeSchema,
    allowedIntegrations: z.array(integrationTypeSchema),
    allowedCustomIntegrations: z.array(z.string()),
    allowedExecutorSourceIds: z.array(z.string()),
    allowedSkillSlugs: z.array(z.string()),
    schedule: scheduleSchema.nullable(),
  }),
  documents: z.array(coworkerDefinitionDocumentSchema).default([]),
});

function getResolvedCoworkerToolPolicy(wf: {
  toolAccessMode: CoworkerToolAccessMode | null;
  allowedIntegrations: string[];
  allowedSkillSlugs: string[] | null;
}) {
  return {
    toolAccessMode: normalizeCoworkerToolAccessMode(wf.toolAccessMode, wf.allowedIntegrations),
    allowedSkillSlugs: normalizeCoworkerAllowedSkillSlugs(wf.allowedSkillSlugs),
  };
}

function isBlankMetadataValue(value: string | null | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

async function ensureBuilderCoworkerMetadata(params: {
  context: {
    user: { id: string };
    db: unknown;
  };
  wf: typeof coworker.$inferSelect;
}): Promise<typeof coworker.$inferSelect> {
  const { context, wf } = params;
  const database = context.db as {
    query: {
      coworker: { findFirst: (...args: unknown[]) => Promise<unknown> };
    };
    update: (table: typeof coworker) => {
      set: (
        values: Partial<Pick<typeof coworker.$inferInsert, "name" | "description" | "username">>,
      ) => {
        where: (clause: unknown) => {
          returning: () => Promise<Array<typeof coworker.$inferSelect>>;
        };
      };
    };
  };

  if (!wf.builderConversationId || !wf.prompt?.trim()) {
    return wf;
  }

  if (
    !isBlankMetadataValue(wf.name) &&
    !isBlankMetadataValue(wf.description) &&
    !isBlankMetadataValue(wf.username)
  ) {
    return wf;
  }

  const coworkerQueryDatabase = database as {
    query: {
      coworker: { findFirst: (...args: unknown[]) => Promise<unknown> };
    };
  };
  const metadataUpdates = await generateCoworkerMetadataOnFirstPromptFill({
    database: coworkerQueryDatabase,
    current: {
      id: wf.id,
      name: wf.name,
      description: wf.description,
      username: wf.username,
      prompt: "",
      triggerType: wf.triggerType,
      allowedIntegrations: wf.allowedIntegrations,
      allowedCustomIntegrations: wf.allowedCustomIntegrations,
      schedule: wf.schedule ?? null,
      autoApprove: wf.autoApprove,
      promptDo: wf.promptDo ?? null,
      promptDont: wf.promptDont ?? null,
    },
    next: {
      id: wf.id,
      name: wf.name,
      description: wf.description,
      username: wf.username,
      prompt: wf.prompt,
      triggerType: wf.triggerType,
      allowedIntegrations: wf.allowedIntegrations,
      allowedCustomIntegrations: wf.allowedCustomIntegrations,
      schedule: wf.schedule ?? null,
      autoApprove: wf.autoApprove,
      promptDo: wf.promptDo ?? null,
      promptDont: wf.promptDont ?? null,
    },
  });

  if (Object.keys(metadataUpdates).length === 0) {
    return wf;
  }

  const [updated] = await database
    .update(coworker)
    .set(metadataUpdates)
    .where(
      wf.workspaceId
        ? and(
            eq(coworker.id, wf.id),
            eq(coworker.ownerId, context.user.id),
            eq(coworker.workspaceId, wf.workspaceId),
          )
        : and(eq(coworker.id, wf.id), eq(coworker.ownerId, context.user.id)),
    )
    .returning();

  return updated ?? { ...wf, ...metadataUpdates };
}

const list = protectedProcedure.handler(async ({ context }) => {
  const {
    workspace: { id: workspaceId },
  } = await requireActiveWorkspaceAccess(context.user.id);
  const coworkers = await context.db.query.coworker.findMany({
    where: and(eq(coworker.ownerId, context.user.id), eq(coworker.workspaceId, workspaceId)),
    orderBy: (wf, { desc }) => [desc(wf.updatedAt)],
  });

  await reconcileStaleCoworkerRunsForCoworkers(coworkers.map((row) => row.id));

  const items = await Promise.all(
    coworkers.map(async (coworkerRow) => {
      const wf = await ensureBuilderCoworkerMetadata({
        context,
        wf: coworkerRow,
      });
      const runs = await context.db.query.coworkerRun.findMany({
        where: eq(coworkerRun.coworkerId, wf.id),
        orderBy: (run, { desc }) => [desc(run.startedAt)],
        limit: 20,
        with: {
          generation: {
            columns: {
              conversationId: true,
            },
          },
        },
      });
      const lastRun = runs[0];
      const { toolAccessMode, allowedSkillSlugs } = getResolvedCoworkerToolPolicy(wf);

      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        username: wf.username,
        status: wf.status,
        autoApprove: wf.autoApprove,
        model: wf.model,
        authSource: wf.authSource,
        triggerType: wf.triggerType,
        integrations: wf.allowedIntegrations,
        toolAccessMode,
        allowedIntegrations: wf.allowedIntegrations,
        allowedCustomIntegrations: wf.allowedCustomIntegrations,
        allowedExecutorSourceIds: wf.allowedExecutorSourceIds,
        allowedSkillSlugs,
        schedule: wf.schedule,
        sharedAt: wf.sharedAt,
        updatedAt: wf.updatedAt,
        lastRunStatus: lastRun?.status ?? null,
        lastRunAt: lastRun?.startedAt ?? null,
        recentRuns: runs.map((run) => {
          const payload =
            run.triggerPayload && typeof run.triggerPayload === "object"
              ? (run.triggerPayload as Record<string, unknown>)
              : null;
          const source = payload && Object.keys(payload).length > 0 ? "trigger" : "manual";

          return {
            id: run.id,
            status: run.status,
            startedAt: run.startedAt,
            conversationId: run.generation?.conversationId ?? null,
            source,
          };
        }),
      };
    }),
  );

  return items;
});

const get = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { coworker: coworkerRow } = await requireOwnedCoworkerInActiveWorkspace(
      context,
      input.id,
    );

    await reconcileStaleCoworkerRunsForCoworker(coworkerRow.id);

    const wf = await ensureBuilderCoworkerMetadata({
      context,
      wf: coworkerRow,
    });

    const runs = await context.db.query.coworkerRun.findMany({
      where: eq(coworkerRun.coworkerId, wf.id),
      orderBy: (run, { desc }) => [desc(run.startedAt)],
      limit: 20,
    });
    const documents = await context.db.query.coworkerDocument.findMany({
      where: eq(coworkerDocument.coworkerId, wf.id),
      orderBy: (document, { desc }) => [desc(document.createdAt)],
    });
    const { toolAccessMode, allowedSkillSlugs } = getResolvedCoworkerToolPolicy(wf);

    return {
      id: wf.id,
      name: wf.name,
      description: wf.description,
      username: wf.username,
      status: wf.status,
      autoApprove: wf.autoApprove,
      model: wf.model,
      authSource: wf.authSource,
      triggerType: wf.triggerType,
      prompt: wf.prompt,
      promptDo: wf.promptDo,
      promptDont: wf.promptDont,
      toolAccessMode,
      allowedIntegrations: wf.allowedIntegrations,
      allowedCustomIntegrations: wf.allowedCustomIntegrations,
      allowedExecutorSourceIds: wf.allowedExecutorSourceIds,
      allowedSkillSlugs,
      schedule: wf.schedule,
      sharedAt: wf.sharedAt,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
      documents: documents.map((document) => ({
        id: document.id,
        filename: document.filename,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        description: document.description,
        createdAt: document.createdAt,
      })),
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        errorMessage: run.errorMessage,
      })),
    };
  });

const create = protectedProcedure
  .input(
    z.object({
      name: z.string().max(128).optional(),
      description: z.string().max(280).nullish(),
      username: z.string().max(128).nullish(),
      triggerType: triggerTypeSchema,
      prompt: z.string().max(20000),
      model: modelReferenceSchema.default(DEFAULT_CONNECTED_CHATGPT_MODEL),
      authSource: providerAuthSourceSchema.nullish(),
      promptDo: z.string().max(2000).optional(),
      promptDont: z.string().max(2000).optional(),
      autoApprove: z.boolean().optional(),
      toolAccessMode: toolAccessModeSchema.default("all"),
      allowedIntegrations: z.array(integrationTypeSchema).default(DEFAULT_COWORKER_INTEGRATIONS),
      allowedCustomIntegrations: z.array(z.string()).default([]),
      allowedExecutorSourceIds: z.array(z.string()).default([]),
      allowedSkillSlugs: z.array(z.string()).default([]),
      schedule: scheduleSchema.nullish(),
    }),
  )
  .handler(async ({ input, context }) => {
    const coworkerId = crypto.randomUUID();
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);
    const dbUser = await context.db.query.user.findFirst({
      where: eq(user.id, context.user.id),
      columns: { role: true },
    });
    assertModelAllowedForRole(input.model, dbUser?.role);
    const resolvedAuthSource = resolveCoworkerAuthSource(input.model, input.authSource);
    const coworkerQueryDatabase = context.db as unknown as {
      query: {
        coworker: { findFirst: (...args: unknown[]) => Promise<unknown> };
      };
    };
    const providedName = input.name?.trim();
    const nameToSave = providedName && providedName.length > 0 ? providedName : "";
    const descriptionToSave = normalizeDescriptionInput(input.description);
    const usernameToSave = await resolveCoworkerUsername({
      database: coworkerQueryDatabase,
      coworkerId,
      username: input.username,
    });

    const [created] = await context.db
      .insert(coworker)
      .values({
        id: coworkerId,
        name: nameToSave,
        description: descriptionToSave,
        username: usernameToSave,
        ownerId: context.user.id,
        workspaceId,
        status: "on",
        triggerType: input.triggerType,
        prompt: input.prompt,
        model: input.model,
        authSource: resolvedAuthSource,
        promptDo: input.promptDo,
        promptDont: input.promptDont,
        autoApprove: input.autoApprove ?? true,
        allowedIntegrations: input.allowedIntegrations,
        allowedCustomIntegrations: input.allowedCustomIntegrations,
        allowedExecutorSourceIds: input.allowedExecutorSourceIds,
        toolAccessMode: input.toolAccessMode,
        allowedSkillSlugs: normalizeCoworkerAllowedSkillSlugs(input.allowedSkillSlugs),
        schedule: input.schedule ?? null,
      })
      .returning();

    if (created.triggerType === "schedule") {
      try {
        await syncCoworkerScheduleJob(created);
      } catch (error) {
        console.error(`[coworker] failed to sync scheduler after create (${created.id})`, error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Coworker created but failed to sync schedule job",
        });
      }
    }

    return {
      id: created.id,
      name: created.name,
      description: created.description,
      username: created.username,
      status: created.status,
    };
  });

const update = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      name: z.string().max(128).optional(),
      description: z.string().max(280).nullish(),
      username: z.string().max(128).nullish(),
      status: z.enum(["on", "off"]).optional(),
      triggerType: triggerTypeSchema.optional(),
      prompt: z.string().max(20000).optional(),
      model: modelReferenceSchema.optional(),
      authSource: providerAuthSourceSchema.nullish(),
      promptDo: z.string().max(2000).nullish(),
      promptDont: z.string().max(2000).nullish(),
      autoApprove: z.boolean().optional(),
      toolAccessMode: toolAccessModeSchema.optional(),
      allowedIntegrations: z.array(integrationTypeSchema).optional(),
      allowedCustomIntegrations: z.array(z.string()).optional(),
      allowedExecutorSourceIds: z.array(z.string()).optional(),
      allowedSkillSlugs: z.array(z.string()).optional(),
      schedule: scheduleSchema.nullish(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { coworker: existing, workspaceId } = await requireOwnedCoworkerInActiveWorkspace(
      context,
      input.id,
    );

    if (input.model !== undefined) {
      const dbUser = await context.db.query.user.findFirst({
        where: eq(user.id, context.user.id),
        columns: { role: true },
      });
      assertModelAllowedForRole(input.model, dbUser?.role);
    }

    const updates: Partial<typeof coworker.$inferInsert> = {};
    const nextPrompt = input.prompt ?? existing.prompt;
    const nextName = input.name !== undefined ? input.name.trim() : (existing.name ?? "");
    const nextDescription =
      input.description !== undefined
        ? normalizeDescriptionInput(input.description)
        : existing.description;
    const coworkerQueryDatabase = context.db as unknown as {
      query: {
        coworker: { findFirst: (...args: unknown[]) => Promise<unknown> };
      };
    };
    const nextUsername =
      input.username !== undefined
        ? await resolveCoworkerUsername({
            database: coworkerQueryDatabase,
            coworkerId: existing.id,
            username: input.username,
          })
        : existing.username;

    if (input.name !== undefined) {
      updates.name = nextName;
    }
    if (input.description !== undefined) {
      updates.description = nextDescription;
    }
    if (input.username !== undefined) {
      updates.username = nextUsername;
    }
    if (input.status !== undefined) {
      updates.status = input.status;
    }
    if (input.triggerType !== undefined) {
      updates.triggerType = input.triggerType;
    }
    if (input.prompt !== undefined) {
      updates.prompt = input.prompt;
    }
    if (input.model !== undefined) {
      updates.model = input.model;
      updates.authSource = resolveCoworkerAuthSource(
        input.model,
        input.authSource ?? existing.authSource,
      );
    } else if (input.authSource !== undefined) {
      updates.authSource = resolveCoworkerAuthSource(existing.model, input.authSource);
    }
    if (input.promptDo !== undefined) {
      updates.promptDo = input.promptDo ?? null;
    }
    if (input.promptDont !== undefined) {
      updates.promptDont = input.promptDont ?? null;
    }
    if (input.autoApprove !== undefined) {
      updates.autoApprove = input.autoApprove;
    }
    if (input.toolAccessMode !== undefined) {
      updates.toolAccessMode = input.toolAccessMode;
    }
    if (input.allowedIntegrations !== undefined) {
      updates.allowedIntegrations = input.allowedIntegrations;
    }
    if (input.allowedCustomIntegrations !== undefined) {
      updates.allowedCustomIntegrations = input.allowedCustomIntegrations;
    }
    if (input.allowedExecutorSourceIds !== undefined) {
      updates.allowedExecutorSourceIds = input.allowedExecutorSourceIds;
    }
    if (input.allowedSkillSlugs !== undefined) {
      updates.allowedSkillSlugs = normalizeCoworkerAllowedSkillSlugs(input.allowedSkillSlugs);
    }
    if (input.schedule !== undefined) {
      updates.schedule = input.schedule ?? null;
    }

    const metadataUpdates = await generateCoworkerMetadataOnFirstPromptFill({
      database: coworkerQueryDatabase,
      current: {
        id: existing.id,
        name: existing.name,
        description: existing.description,
        username: existing.username,
        prompt: existing.prompt,
        triggerType: existing.triggerType,
        allowedIntegrations: existing.allowedIntegrations,
        allowedCustomIntegrations: existing.allowedCustomIntegrations,
        schedule: existing.schedule ?? null,
        autoApprove: existing.autoApprove,
        promptDo: existing.promptDo ?? null,
        promptDont: existing.promptDont ?? null,
      },
      next: {
        id: existing.id,
        name: nextName,
        description: nextDescription,
        username: nextUsername,
        prompt: nextPrompt,
        triggerType: input.triggerType ?? existing.triggerType,
        allowedIntegrations: input.allowedIntegrations ?? existing.allowedIntegrations,
        allowedCustomIntegrations:
          input.allowedCustomIntegrations ?? existing.allowedCustomIntegrations,
        schedule: input.schedule === undefined ? existing.schedule : (input.schedule ?? null),
        autoApprove: input.autoApprove ?? existing.autoApprove,
        promptDo: input.promptDo === undefined ? existing.promptDo : (input.promptDo ?? null),
        promptDont:
          input.promptDont === undefined ? existing.promptDont : (input.promptDont ?? null),
      },
    });
    Object.assign(updates, metadataUpdates);

    const result = await context.db
      .update(coworker)
      .set(updates)
      .where(
        and(
          eq(coworker.id, input.id),
          eq(coworker.ownerId, context.user.id),
          eq(coworker.workspaceId, workspaceId),
        ),
      )
      .returning({
        id: coworker.id,
        status: coworker.status,
        triggerType: coworker.triggerType,
        schedule: coworker.schedule,
      });

    if (result.length === 0) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

    const shouldSyncSchedule =
      input.status !== undefined || input.triggerType !== undefined || input.schedule !== undefined;

    if (shouldSyncSchedule) {
      try {
        await syncCoworkerScheduleJob(result[0]!);
      } catch (error) {
        console.error(`[coworker] failed to sync scheduler after update (${input.id})`, error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Coworker updated but failed to sync schedule job",
        });
      }
    }

    return { success: true };
  });

const del = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { workspaceId } = await requireOwnedCoworkerInActiveWorkspace(context, input.id);
    const result = await context.db
      .delete(coworker)
      .where(
        and(
          eq(coworker.id, input.id),
          eq(coworker.ownerId, context.user.id),
          eq(coworker.workspaceId, workspaceId),
        ),
      )
      .returning({ id: coworker.id });

    if (result.length === 0) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

    try {
      await removeCoworkerScheduleJob(input.id);
    } catch (error) {
      console.error(`[coworker] failed to remove scheduler after delete (${input.id})`, error);
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Coworker deleted but failed to remove schedule job",
      });
    }

    return { success: true };
  });

const edit = protectedProcedure
  .input(
    z.object({
      coworkerId: z.string(),
      baseUpdatedAt: z.string().datetime({ offset: true }),
      changes: coworkerBuilderEditSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    await requireOwnedCoworkerInActiveWorkspace(context, input.coworkerId);
    const dbUser = await context.db.query.user.findFirst({
      where: eq(user.id, context.user.id),
      columns: { role: true },
    });

    const result = await applyCoworkerEdit({
      database: context.db as unknown,
      userId: context.user.id,
      userRole: dbUser?.role ?? null,
      coworkerId: input.coworkerId,
      baseUpdatedAt: input.baseUpdatedAt,
      changes: input.changes,
    });

    return result;
  });

const uploadDocument = protectedProcedure
  .input(
    z.object({
      coworkerId: z.string(),
      filename: z.string().min(1).max(256),
      mimeType: z.string().min(1),
      content: z.string().min(1),
      description: z.string().max(1024).optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    await requireOwnedCoworkerInActiveWorkspace(context, input.coworkerId);
    return uploadCoworkerDocument({
      database: context.db as typeof import("@cmdclaw/db/client").db,
      userId: context.user.id,
      coworkerId: input.coworkerId,
      filename: input.filename,
      mimeType: input.mimeType,
      contentBase64: input.content,
      description: input.description,
    });
  });

const deleteDocument = protectedProcedure
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .handler(async ({ input, context }) => {
    const existingDocument = await context.db.query.coworkerDocument.findFirst({
      where: eq(coworkerDocument.id, input.id),
      columns: { coworkerId: true },
    });

    if (!existingDocument) {
      throw new ORPCError("NOT_FOUND", { message: "Document not found" });
    }

    await requireOwnedCoworkerInActiveWorkspace(context, existingDocument.coworkerId);
    return deleteCoworkerDocument({
      database: context.db as typeof import("@cmdclaw/db/client").db,
      userId: context.user.id,
      documentId: input.id,
    });
  });

const trigger = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      payload: z.unknown().optional(),
      fileAttachments: z
        .array(
          z.object({
            name: z.string(),
            mimeType: z.string(),
            dataUrl: z.string(),
          }),
        )
        .optional(),
      remoteIntegrationSource: remoteIntegrationSourceSchema
        .pick({
          targetEnv: true,
          remoteUserId: true,
        })
        .optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    await requireOwnedCoworkerInActiveWorkspace(context, input.id);
    const dbUser = await context.db.query.user.findFirst({
      where: eq(user.id, context.user.id),
      columns: { role: true, email: true },
    });

    if (input.remoteIntegrationSource && dbUser?.role !== "admin") {
      throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
    }

    return triggerCoworkerRun({
      coworkerId: input.id,
      triggerPayload: input.payload ?? {},
      fileAttachments: input.fileAttachments,
      userId: context.user.id,
      userRole: dbUser?.role ?? null,
      remoteIntegrationSource: input.remoteIntegrationSource
        ? {
            ...input.remoteIntegrationSource,
            requestedByUserId: context.user.id,
            requestedByEmail: dbUser?.email ?? null,
          }
        : undefined,
    });
  });

const listRemoteIntegrationTargets = protectedProcedure.handler(async ({ context }) => {
  await requireAdminUser(context);
  return {
    targets: listConfiguredRemoteIntegrationTargets(),
  };
});

const searchRemoteIntegrationUsersProcedure = protectedProcedure
  .input(
    z.object({
      targetEnv: remoteIntegrationTargetEnvSchema,
      query: z.string().default(""),
      limit: z.number().int().min(1).max(25).optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    await requireAdminUser(context);

    return {
      users: await searchRemoteIntegrationUsers({
        targetEnv: input.targetEnv,
        query: input.query,
        limit: input.limit,
      }),
    };
  });

const getRun = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);
    const runFilter = and(
      eq(coworkerRun.id, input.id),
      eq(coworkerRun.ownerId, context.user.id),
      eq(coworkerRun.workspaceId, workspaceId),
    );

    const initialRun = await context.db.query.coworkerRun.findFirst({
      where: runFilter,
    });

    if (!initialRun) {
      throw new ORPCError("NOT_FOUND", { message: "Run not found" });
    }

    await reconcileStaleCoworkerRunsForCoworker(initialRun.coworkerId);

    const run = await context.db.query.coworkerRun.findFirst({
      where: runFilter,
    });

    if (!run) {
      throw new ORPCError("NOT_FOUND", { message: "Run not found" });
    }

    const wf = await context.db.query.coworker.findFirst({
      where: and(
        eq(coworker.id, run.coworkerId),
        eq(coworker.ownerId, context.user.id),
        eq(coworker.workspaceId, workspaceId),
      ),
      columns: {
        id: true,
        name: true,
        username: true,
      },
    });

    if (!wf) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

    const events = await context.db.query.coworkerRunEvent.findMany({
      where: eq(coworkerRunEvent.coworkerRunId, run.id),
      orderBy: (evt, { asc }) => [asc(evt.createdAt)],
    });
    const gen = run.generationId
      ? await context.db.query.generation.findFirst({
          where: eq(generation.id, run.generationId),
          columns: {
            conversationId: true,
            debugInfo: true,
          },
        })
      : null;

    return {
      id: run.id,
      coworkerId: run.coworkerId,
      coworkerName: wf.name,
      coworkerUsername: wf.username,
      status: run.status,
      triggerPayload: run.triggerPayload,
      generationId: run.generationId,
      conversationId: gen?.conversationId ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errorMessage: run.errorMessage,
      debugInfo: run.debugInfo ?? gen?.debugInfo ?? null,
      events: events.map((evt) => ({
        id: evt.id,
        type: evt.type,
        payload: evt.payload,
        createdAt: evt.createdAt,
      })),
    };
  });

const listRuns = protectedProcedure
  .input(
    z.object({
      coworkerId: z.string(),
      limit: z.number().min(1).max(50).default(20),
    }),
  )
  .handler(async ({ input, context }) => {
    const { coworker: wf, workspaceId } = await requireOwnedCoworkerInActiveWorkspace(
      context,
      input.coworkerId,
    );

    await reconcileStaleCoworkerRunsForCoworker(wf.id);

    const runs = await context.db.query.coworkerRun.findMany({
      where: and(
        eq(coworkerRun.coworkerId, wf.id),
        eq(coworkerRun.ownerId, context.user.id),
        eq(coworkerRun.workspaceId, workspaceId),
      ),
      orderBy: (run, { desc }) => [desc(run.startedAt)],
      limit: input.limit,
    });

    return runs.map((run) => ({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errorMessage: run.errorMessage,
    }));
  });

const getForwardingAlias = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { coworker: wf } = await requireOwnedCoworkerInActiveWorkspace(context, input.id);

    const receivingDomain = getReceivingDomain();
    if (!receivingDomain || wf.triggerType !== EMAIL_FORWARDED_TRIGGER_TYPE) {
      return {
        receivingDomain,
        activeAlias: null,
        forwardingAddress: null,
      };
    }

    const activeAlias = await context.db.query.coworkerEmailAlias.findFirst({
      where: and(
        eq(coworkerEmailAlias.coworkerId, wf.id),
        eq(coworkerEmailAlias.domain, receivingDomain),
        eq(coworkerEmailAlias.status, "active"),
      ),
      columns: {
        id: true,
        localPart: true,
        domain: true,
        status: true,
        createdAt: true,
      },
      orderBy: (row, { desc }) => [desc(row.createdAt)],
    });

    return {
      receivingDomain,
      activeAlias,
      forwardingAddress: activeAlias
        ? buildCoworkerForwardingAddress(activeAlias.localPart, receivingDomain)
        : null,
    };
  });

const createForwardingAlias = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const receivingDomain = getReceivingDomain();
    if (!receivingDomain) {
      throw new ORPCError("BAD_REQUEST", {
        message: "RESEND_RECEIVING_DOMAIN is not configured",
      });
    }

    const { coworker: wf } = await requireOwnedCoworkerInActiveWorkspace(context, input.id);

    if (wf.triggerType !== EMAIL_FORWARDED_TRIGGER_TYPE) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Coworker trigger must be email.forwarded to create an email alias",
      });
    }

    const existing = await context.db.query.coworkerEmailAlias.findFirst({
      where: and(
        eq(coworkerEmailAlias.coworkerId, wf.id),
        eq(coworkerEmailAlias.domain, receivingDomain),
        eq(coworkerEmailAlias.status, "active"),
      ),
      columns: {
        id: true,
        localPart: true,
        domain: true,
        status: true,
        createdAt: true,
      },
      orderBy: (row, { desc }) => [desc(row.createdAt)],
    });

    if (existing) {
      return {
        alias: existing,
        forwardingAddress: buildCoworkerForwardingAddress(existing.localPart, receivingDomain),
      };
    }

    const insertAlias = async (
      attempt = 0,
    ): Promise<{
      id: string;
      localPart: string;
      domain: string;
      status: "active" | "disabled" | "rotated" | "deleted";
      createdAt: Date;
    } | null> => {
      if (attempt >= COWORKER_ALIAS_GENERATION_MAX_ATTEMPTS) {
        return null;
      }

      const localPart =
        attempt < COWORKER_ALIAS_GENERATION_MAX_ATTEMPTS / 2
          ? generateCoworkerAliasLocalPart()
          : `${generateCoworkerAliasLocalPart()}-${crypto.randomUUID().slice(0, 6)}`;
      const created = await context.db
        .insert(coworkerEmailAlias)
        .values({
          coworkerId: wf.id,
          localPart,
          domain: receivingDomain,
          status: "active" as const,
        })
        .onConflictDoNothing({
          target: [coworkerEmailAlias.localPart, coworkerEmailAlias.domain],
        })
        .returning({
          id: coworkerEmailAlias.id,
          localPart: coworkerEmailAlias.localPart,
          domain: coworkerEmailAlias.domain,
          status: coworkerEmailAlias.status,
          createdAt: coworkerEmailAlias.createdAt,
        });

      if (created[0]) {
        return created[0];
      }

      return insertAlias(attempt + 1);
    };

    const created = await insertAlias();

    if (created) {
      return {
        alias: created,
        forwardingAddress: buildCoworkerForwardingAddress(created.localPart, receivingDomain),
      };
    }

    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Failed to create unique forwarding alias",
    });
  });

const disableForwardingAlias = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { coworker: wf } = await requireOwnedCoworkerInActiveWorkspace(context, input.id);

    const activeAlias = await context.db.query.coworkerEmailAlias.findFirst({
      where: and(eq(coworkerEmailAlias.coworkerId, wf.id), eq(coworkerEmailAlias.status, "active")),
      columns: { id: true },
      orderBy: (row, { desc }) => [desc(row.createdAt)],
    });

    if (!activeAlias) {
      return { success: true, disabled: false };
    }

    await context.db
      .update(coworkerEmailAlias)
      .set({
        status: "disabled",
        disabledAt: new Date(),
        disabledReason: "manual_disable",
      })
      .where(eq(coworkerEmailAlias.id, activeAlias.id));

    return { success: true, disabled: true };
  });

const rotateForwardingAlias = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const receivingDomain = getReceivingDomain();
    if (!receivingDomain) {
      throw new ORPCError("BAD_REQUEST", {
        message: "RESEND_RECEIVING_DOMAIN is not configured",
      });
    }

    const { coworker: wf } = await requireOwnedCoworkerInActiveWorkspace(context, input.id);

    if (wf.triggerType !== EMAIL_FORWARDED_TRIGGER_TYPE) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Coworker trigger must be email.forwarded to rotate an email alias",
      });
    }

    const result = await context.db.transaction(async (tx) => {
      const currentActive = await tx.query.coworkerEmailAlias.findFirst({
        where: and(
          eq(coworkerEmailAlias.coworkerId, wf.id),
          eq(coworkerEmailAlias.domain, receivingDomain),
          eq(coworkerEmailAlias.status, "active"),
        ),
        columns: { id: true, localPart: true },
        orderBy: (row, { desc }) => [desc(row.createdAt)],
      });

      const insertAlias = async (
        attempt = 0,
      ): Promise<{
        id: string;
        localPart: string;
        domain: string;
        status: "active" | "disabled" | "rotated" | "deleted";
        createdAt: Date;
      } | null> => {
        if (attempt >= COWORKER_ALIAS_GENERATION_MAX_ATTEMPTS) {
          return null;
        }

        const localPart =
          attempt < COWORKER_ALIAS_GENERATION_MAX_ATTEMPTS / 2
            ? generateCoworkerAliasLocalPart()
            : `${generateCoworkerAliasLocalPart()}-${crypto.randomUUID().slice(0, 6)}`;
        const created = await tx
          .insert(coworkerEmailAlias)
          .values({
            coworkerId: wf.id,
            localPart,
            domain: receivingDomain,
            status: "active" as const,
          })
          .onConflictDoNothing({
            target: [coworkerEmailAlias.localPart, coworkerEmailAlias.domain],
          })
          .returning({
            id: coworkerEmailAlias.id,
            localPart: coworkerEmailAlias.localPart,
            domain: coworkerEmailAlias.domain,
            status: coworkerEmailAlias.status,
            createdAt: coworkerEmailAlias.createdAt,
          });

        if (created[0]) {
          return created[0];
        }

        return insertAlias(attempt + 1);
      };

      const created = await insertAlias();

      if (!created) {
        return null;
      }

      if (currentActive) {
        await tx
          .update(coworkerEmailAlias)
          .set({
            status: "rotated",
            disabledAt: new Date(),
            disabledReason: "rotated",
            replacedByAliasId: created.id,
          })
          .where(eq(coworkerEmailAlias.id, currentActive.id));
      }

      return created;
    });

    if (!result) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to rotate forwarding alias",
      });
    }

    return {
      alias: result,
      forwardingAddress: buildCoworkerForwardingAddress(result.localPart, receivingDomain),
    };
  });

const share = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { coworker: wf, workspaceId } = await requireOwnedCoworkerInActiveWorkspace(
      context,
      input.id,
    );
    const [shared] = await context.db
      .update(coworker)
      .set({ sharedAt: new Date() })
      .where(
        and(
          eq(coworker.id, wf.id),
          eq(coworker.ownerId, context.user.id),
          eq(coworker.workspaceId, workspaceId),
        ),
      )
      .returning({ id: coworker.id, sharedAt: coworker.sharedAt });

    return {
      success: true,
      id: shared?.id ?? wf.id,
      sharedAt: shared?.sharedAt ?? new Date(),
    };
  });

const unshare = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { coworker: wf, workspaceId } = await requireOwnedCoworkerInActiveWorkspace(
      context,
      input.id,
    );
    await context.db
      .update(coworker)
      .set({ sharedAt: null })
      .where(
        and(
          eq(coworker.id, wf.id),
          eq(coworker.ownerId, context.user.id),
          eq(coworker.workspaceId, workspaceId),
        ),
      );

    return { success: true };
  });

const listShared = protectedProcedure.handler(async ({ context }) => {
  const {
    workspace: { id: workspaceId },
  } = await requireActiveWorkspaceAccess(context.user.id);
  const coworkers = await context.db.query.coworker.findMany({
    where: and(eq(coworker.workspaceId, workspaceId)),
    with: {
      owner: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      documents: {
        columns: { id: true },
      },
    },
    orderBy: (wf, { desc }) => [desc(wf.sharedAt), desc(wf.updatedAt)],
  });

  return coworkers
    .filter((wf) => wf.sharedAt)
    .map((wf) => {
      const { toolAccessMode, allowedSkillSlugs } = getResolvedCoworkerToolPolicy(wf);
      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        username: wf.username,
        triggerType: wf.triggerType,
        toolAccessMode,
        allowedIntegrations: wf.allowedIntegrations,
        allowedSkillSlugs,
        allowedExecutorSourceIds: wf.allowedExecutorSourceIds,
        prompt: wf.prompt,
        model: wf.model,
        sharedAt: wf.sharedAt,
        updatedAt: wf.updatedAt,
        owner: {
          id: wf.owner.id,
          name: wf.owner.name,
          email: wf.owner.email,
        },
        documentCount: wf.documents.length,
        isOwnedByCurrentUser: wf.ownerId === context.user.id,
      };
    });
});

const exportDefinition = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { coworker: coworkerRow } = await requireOwnedCoworkerInActiveWorkspace(
      context,
      input.id,
    );
    const wf = await ensureBuilderCoworkerMetadata({
      context,
      wf: coworkerRow,
    });
    const { toolAccessMode, allowedSkillSlugs } = getResolvedCoworkerToolPolicy(wf);
    const documents = await context.db.query.coworkerDocument.findMany({
      where: eq(coworkerDocument.coworkerId, wf.id),
      orderBy: (document, { asc }) => [asc(document.createdAt)],
    });

    return {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      coworker: {
        name: wf.name ?? "",
        description: wf.description,
        username: wf.username,
        status: wf.status,
        triggerType: wf.triggerType,
        prompt: wf.prompt,
        model: wf.model,
        authSource: wf.authSource,
        promptDo: wf.promptDo,
        promptDont: wf.promptDont,
        autoApprove: wf.autoApprove,
        toolAccessMode,
        allowedIntegrations: wf.allowedIntegrations,
        allowedCustomIntegrations: wf.allowedCustomIntegrations,
        allowedExecutorSourceIds: wf.allowedExecutorSourceIds,
        allowedSkillSlugs,
        schedule: wf.schedule ?? null,
      },
      documents: await Promise.all(
        documents.map(async (document) => ({
          filename: document.filename,
          mimeType: document.mimeType,
          description: document.description,
          contentBase64: (await downloadFromS3(document.storageKey)).toString("base64"),
        })),
      ),
    };
  });

const importShared = protectedProcedure
  .input(
    z.object({
      sourceCoworkerId: z.string(),
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);
    const dbUser = await context.db.query.user.findFirst({
      where: eq(user.id, context.user.id),
      columns: { role: true },
    });

    const source = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.sourceCoworkerId), eq(coworker.workspaceId, workspaceId)),
    });

    if (!source || !source.sharedAt) {
      throw new ORPCError("NOT_FOUND", {
        message: "Shared coworker not found",
      });
    }

    assertModelAllowedForRole(source.model, dbUser?.role);

    const coworkerId = crypto.randomUUID();
    const coworkerQueryDatabase = context.db as unknown as {
      query: {
        coworker: { findFirst: (...args: unknown[]) => Promise<unknown> };
      };
    };
    const username = await resolveCoworkerUsername({
      database: coworkerQueryDatabase,
      coworkerId,
      username: source.username,
    });

    const [created] = await context.db
      .insert(coworker)
      .values({
        id: coworkerId,
        name: source.name,
        description: source.description,
        username,
        ownerId: context.user.id,
        workspaceId,
        status: "off",
        triggerType: source.triggerType,
        prompt: source.prompt,
        model: source.model,
        authSource: source.authSource,
        promptDo: source.promptDo,
        promptDont: source.promptDont,
        autoApprove: source.autoApprove,
        toolAccessMode: source.toolAccessMode,
        allowedIntegrations: source.allowedIntegrations,
        allowedCustomIntegrations: source.allowedCustomIntegrations,
        allowedExecutorSourceIds: source.allowedExecutorSourceIds,
        allowedSkillSlugs: source.allowedSkillSlugs,
        schedule: source.schedule,
        sharedAt: null,
      })
      .returning({
        id: coworker.id,
        name: coworker.name,
        description: coworker.description,
        username: coworker.username,
        status: coworker.status,
      });

    await copyCoworkerDocuments({
      context,
      sourceCoworkerId: source.id,
      targetCoworkerId: coworkerId,
      targetUserId: context.user.id,
    });

    return created;
  });

const importDefinition = protectedProcedure
  .input(
    z.object({
      definitionJson: z.string().min(2).max(50_000_000),
    }),
  )
  .handler(async ({ input, context }) => {
    let parsedDefinition: unknown;

    try {
      parsedDefinition = JSON.parse(input.definitionJson);
    } catch {
      throw new ORPCError("BAD_REQUEST", {
        message: "Coworker JSON is not valid JSON.",
      });
    }

    const definition = coworkerDefinitionSchema.parse(parsedDefinition);
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);
    const dbUser = await context.db.query.user.findFirst({
      where: eq(user.id, context.user.id),
      columns: { role: true },
    });

    assertModelAllowedForRole(definition.coworker.model, dbUser?.role);

    const coworkerId = crypto.randomUUID();
    const coworkerQueryDatabase = context.db as unknown as {
      query: {
        coworker: { findFirst: (...args: unknown[]) => Promise<unknown> };
      };
    };
    const username = await resolveCoworkerUsername({
      database: coworkerQueryDatabase,
      coworkerId,
      username: definition.coworker.username,
    });
    const resolvedAuthSource = resolveCoworkerAuthSource(
      definition.coworker.model,
      definition.coworker.authSource,
    );

    const [created] = await context.db
      .insert(coworker)
      .values({
        id: coworkerId,
        name: definition.coworker.name.trim(),
        description: normalizeDescriptionInput(definition.coworker.description),
        username,
        ownerId: context.user.id,
        workspaceId,
        status: "off",
        triggerType: definition.coworker.triggerType,
        prompt: definition.coworker.prompt,
        model: definition.coworker.model,
        authSource: resolvedAuthSource,
        promptDo: normalizeCoworkerInstructionInput(definition.coworker.promptDo),
        promptDont: normalizeCoworkerInstructionInput(definition.coworker.promptDont),
        autoApprove: definition.coworker.autoApprove,
        toolAccessMode: definition.coworker.toolAccessMode,
        allowedIntegrations: definition.coworker.allowedIntegrations,
        allowedCustomIntegrations: definition.coworker.allowedCustomIntegrations,
        allowedExecutorSourceIds: definition.coworker.allowedExecutorSourceIds,
        allowedSkillSlugs: normalizeCoworkerAllowedSkillSlugs(
          definition.coworker.allowedSkillSlugs,
        ),
        schedule: definition.coworker.schedule,
        sharedAt: null,
      })
      .returning({
        id: coworker.id,
        name: coworker.name,
        description: coworker.description,
        username: coworker.username,
        status: coworker.status,
      });

    await Promise.all(
      definition.documents.map((document) =>
        uploadCoworkerDocument({
          database: context.db as typeof import("@cmdclaw/db/client").db,
          userId: context.user.id,
          coworkerId,
          filename: document.filename,
          mimeType: document.mimeType,
          contentBase64: document.contentBase64,
          description: document.description ?? undefined,
        }),
      ),
    );

    return created;
  });

const adminListWorkspaceCoworkers = protectedProcedure.handler(async ({ context }) => {
  const {
    workspace: { id: workspaceId },
  } = await requireActiveWorkspaceAdmin(context.user.id);
  const coworkers = await context.db.query.coworker.findMany({
    where: eq(coworker.workspaceId, workspaceId),
    with: {
      owner: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: (wf, { desc }) => [desc(wf.updatedAt)],
  });

  return coworkers.map((wf) => ({
    id: wf.id,
    name: wf.name,
    description: wf.description,
    status: wf.status,
    triggerType: wf.triggerType,
    sharedAt: wf.sharedAt,
    updatedAt: wf.updatedAt,
    owner: wf.owner,
  }));
});

const adminGetWorkspaceRun = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAdmin(context.user.id);
    const run = await context.db.query.coworkerRun.findFirst({
      where: and(eq(coworkerRun.id, input.id), eq(coworkerRun.workspaceId, workspaceId)),
      with: {
        coworker: {
          columns: {
            id: true,
            name: true,
          },
          with: {
            owner: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new ORPCError("NOT_FOUND", { message: "Run not found" });
    }

    const events = await context.db.query.coworkerRunEvent.findMany({
      where: eq(coworkerRunEvent.coworkerRunId, run.id),
      orderBy: (evt, { asc }) => [asc(evt.createdAt)],
    });
    const gen = run.generationId
      ? await context.db.query.generation.findFirst({
          where: eq(generation.id, run.generationId),
          columns: {
            conversationId: true,
            debugInfo: true,
          },
        })
      : null;

    return {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errorMessage: run.errorMessage,
      debugInfo: run.debugInfo ?? gen?.debugInfo ?? null,
      conversationId: gen?.conversationId ?? null,
      coworker: run.coworker
        ? {
            id: run.coworker.id,
            name: run.coworker.name,
            owner: run.coworker.owner,
          }
        : null,
      events: events.map((evt) => ({
        id: evt.id,
        type: evt.type,
        payload: evt.payload,
        createdAt: evt.createdAt,
      })),
    };
  });

const getOrCreateBuilderConversation = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const { coworker: ownedCoworker, workspaceId } = await requireOwnedCoworkerInActiveWorkspace(
      context,
      input.id,
    );
    const wf = {
      id: ownedCoworker.id,
      name: ownedCoworker.name,
      builderConversationId: ownedCoworker.builderConversationId,
      model: ownedCoworker.model,
      authSource: ownedCoworker.authSource,
    };

    // Return existing conversation if it still exists
    if (wf.builderConversationId) {
      const existing = await context.db.query.conversation.findFirst({
        where: eq(conversation.id, wf.builderConversationId),
        columns: {
          id: true,
          autoApprove: true,
          workspaceId: true,
          userId: true,
          type: true,
        },
      });
      if (existing) {
        if (existing.autoApprove) {
          await context.db
            .update(conversation)
            .set({ autoApprove: false })
            .where(
              and(
                eq(conversation.id, existing.id),
                eq(conversation.userId, context.user.id),
                eq(conversation.workspaceId, workspaceId),
                eq(conversation.type, "coworker"),
              ),
            );
        }
        if (
          existing.userId === context.user.id &&
          existing.workspaceId === workspaceId &&
          existing.type === "coworker"
        ) {
          return { conversationId: existing.id };
        }
      }
    }

    // Create a new builder conversation
    const [created] = await context.db
      .insert(conversation)
      .values({
        userId: context.user.id,
        workspaceId,
        type: "coworker",
        title: `${wf.name || "Coworker"} – Chat`,
        model: wf.model,
        authSource: wf.authSource,
        autoApprove: false,
      })
      .returning({ id: conversation.id });

    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create conversation",
      });
    }

    await context.db
      .update(coworker)
      .set({ builderConversationId: created.id })
      .where(
        and(
          eq(coworker.id, wf.id),
          eq(coworker.ownerId, context.user.id),
          eq(coworker.workspaceId, workspaceId),
        ),
      );

    return { conversationId: created.id };
  });

// ---------------------------------------------------------------------------
// Overview / dashboard aggregation
// ---------------------------------------------------------------------------

const getOverview = protectedProcedure.handler(async ({ context }) => {
  const {
    workspace: { id: workspaceId },
  } = await requireActiveWorkspaceAccess(context.user.id);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch all coworkers for this user/workspace
  const coworkers = await context.db.query.coworker.findMany({
    where: and(eq(coworker.ownerId, context.user.id), eq(coworker.workspaceId, workspaceId)),
    columns: {
      id: true,
      name: true,
      status: true,
      triggerType: true,
      username: true,
    },
  });

  if (coworkers.length === 0) {
    return {
      summary: {
        totalCoworkers: 0,
        activeCoworkers: 0,
        totalRuns30d: 0,
        errorRuns30d: 0,
        errorRate: 0,
      },
      dailyRuns: [] as Array<{
        date: string;
        completed: number;
        error: number;
        running: number;
        other: number;
      }>,
      coworkers: [] as Array<{
        id: string;
        name: string;
        username: string | null;
        status: string;
        triggerType: string;
        totalRuns: number;
        errorRuns: number;
        errorRate: number;
        consecutiveErrors: number;
        latestRunStatus: string | null;
        latestRunAt: Date | null;
        latestErrorMessage: string | null;
      }>,
    };
  }

  const coworkerIds = coworkers.map((c) => c.id);
  // Build an IN (...) clause. IDs are UUIDs from our own DB query so sql.raw is safe.
  const coworkerIdsIn = sql.raw(`(${coworkerIds.map((id) => `'${id}'`).join(",")})`);

  // Daily aggregation across all coworkers
  const dailyResult = await context.db.execute(sql`
    select
      to_char(started_at, 'YYYY-MM-DD') as "date",
      count(*) filter (where status = 'completed')::int as "completed",
      count(*) filter (where status = 'error')::int as "error",
      count(*) filter (where status = 'running')::int as "running",
      count(*) filter (where status not in ('completed', 'error', 'running'))::int as "other"
    from ${coworkerRun}
    where coworker_id in ${coworkerIdsIn}
      and owner_id = ${context.user.id}
      and workspace_id = ${workspaceId}
      and started_at >= ${thirtyDaysAgo}
    group by to_char(started_at, 'YYYY-MM-DD')
    order by "date" asc
  `);
  const dailyRuns = (dailyResult.rows ?? []) as Array<{
    date: string;
    completed: number;
    error: number;
    running: number;
    other: number;
  }>;

  // Per-coworker stats
  const perCoworkerResult = await context.db.execute(sql`
    select
      coworker_id as "coworkerId",
      count(*)::int as "totalRuns",
      count(*) filter (where status = 'error')::int as "errorRuns"
    from ${coworkerRun}
    where coworker_id in ${coworkerIdsIn}
      and owner_id = ${context.user.id}
      and workspace_id = ${workspaceId}
      and started_at >= ${thirtyDaysAgo}
    group by coworker_id
  `);
  const perCoworkerStats = new Map(
    (
      (perCoworkerResult.rows ?? []) as Array<{
        coworkerId: string;
        totalRuns: number;
        errorRuns: number;
      }>
    ).map((r) => [r.coworkerId, r]),
  );

  // Latest run per coworker
  const latestResult = await context.db.execute(sql`
    select distinct on (coworker_id)
      coworker_id as "coworkerId",
      status,
      started_at as "startedAt",
      error_message as "errorMessage"
    from ${coworkerRun}
    where coworker_id in ${coworkerIdsIn}
      and owner_id = ${context.user.id}
      and workspace_id = ${workspaceId}
    order by coworker_id, started_at desc
  `);
  const latestRuns = new Map(
    (
      (latestResult.rows ?? []) as Array<{
        coworkerId: string;
        status: string;
        startedAt: Date;
        errorMessage: string | null;
      }>
    ).map((r) => [r.coworkerId, r]),
  );

  // Consecutive error streaks: fetch last 20 runs per coworker
  const streakResult = await context.db.execute(sql`
    select coworker_id as "coworkerId", status
    from (
      select coworker_id, status, started_at,
        row_number() over (partition by coworker_id order by started_at desc) as rn
      from ${coworkerRun}
      where coworker_id in ${coworkerIdsIn}
        and owner_id = ${context.user.id}
        and workspace_id = ${workspaceId}
    ) t
    where rn <= 20
    order by coworker_id, started_at desc
  `);
  const streakRows = (streakResult.rows ?? []) as Array<{
    coworkerId: string;
    status: string;
  }>;
  const consecutiveErrorMap = new Map<string, number>();
  {
    let currentId = "";
    let count = 0;
    let counting = true;
    for (const row of streakRows) {
      if (row.coworkerId !== currentId) {
        if (currentId) {
          consecutiveErrorMap.set(currentId, count);
        }
        currentId = row.coworkerId;
        count = 0;
        counting = true;
      }
      if (counting) {
        if (row.status === "error") {
          count++;
        } else {
          counting = false;
        }
      }
    }
    if (currentId) {
      consecutiveErrorMap.set(currentId, count);
    }
  }

  // Build per-coworker response
  const coworkerData = coworkers.map((c) => {
    const stats = perCoworkerStats.get(c.id);
    const latest = latestRuns.get(c.id);
    const totalRuns = stats?.totalRuns ?? 0;
    const errorRuns = stats?.errorRuns ?? 0;
    return {
      id: c.id,
      name: c.name,
      username: c.username,
      status: c.status,
      triggerType: c.triggerType,
      totalRuns,
      errorRuns,
      errorRate: totalRuns > 0 ? Math.round((errorRuns / totalRuns) * 100) : 0,
      consecutiveErrors: consecutiveErrorMap.get(c.id) ?? 0,
      latestRunStatus: latest?.status ?? null,
      latestRunAt: latest?.startedAt ?? null,
      latestErrorMessage: latest?.errorMessage ?? null,
    };
  });

  // Sort by unhealthiest first
  coworkerData.sort(
    (a, b) => b.consecutiveErrors - a.consecutiveErrors || b.errorRate - a.errorRate,
  );

  const totalRuns30d = dailyRuns.reduce(
    (s, d) => s + d.completed + d.error + d.running + d.other,
    0,
  );
  const errorRuns30d = dailyRuns.reduce((s, d) => s + d.error, 0);

  return {
    summary: {
      totalCoworkers: coworkers.length,
      activeCoworkers: coworkers.filter((c) => c.status === "on").length,
      totalRuns30d,
      errorRuns30d,
      errorRate: totalRuns30d > 0 ? Math.round((errorRuns30d / totalRuns30d) * 100) : 0,
    },
    dailyRuns,
    coworkers: coworkerData,
  };
});

export const coworkerRouter = {
  list,
  get,
  getOverview,
  create,
  update,
  edit,
  uploadDocument,
  deleteDocument,
  delete: del,
  trigger,
  listRemoteIntegrationTargets,
  searchRemoteIntegrationUsers: searchRemoteIntegrationUsersProcedure,
  getRun,
  listRuns,
  getForwardingAlias,
  createForwardingAlias,
  disableForwardingAlias,
  rotateForwardingAlias,
  share,
  unshare,
  listShared,
  exportDefinition,
  importShared,
  importDefinition,
  adminListWorkspaceCoworkers,
  adminGetWorkspaceRun,
  getOrCreateBuilderConversation,
};
