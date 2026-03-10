import {
  buildCoworkerForwardingAddress,
  EMAIL_FORWARDED_TRIGGER_TYPE,
  generateCoworkerAliasLocalPart,
} from "@cmdclaw/core/lib/email-forwarding";
import {
  applyCoworkerBuilderPatch,
  coworkerBuilderPatchSchema,
} from "@cmdclaw/core/server/services/coworker-builder-service";
import {
  removeCoworkerScheduleJob,
  syncCoworkerScheduleJob,
} from "@cmdclaw/core/server/services/coworker-scheduler";
import { triggerCoworkerRun } from "@cmdclaw/core/server/services/coworker-service";
import {
  conversation,
  generation,
  user,
  coworker,
  coworkerEmailAlias,
  coworkerRun,
  coworkerRunEvent,
} from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { generateCoworkerName } from "@/server/utils/generate-coworker-name";
import { protectedProcedure } from "../middleware";

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
const ALL_INTEGRATION_TYPES = [...integrationTypeSchema.options];

const triggerTypeSchema = z.string().min(1).max(128);
const COWORKER_ALIAS_GENERATION_MAX_ATTEMPTS = 32;

function getReceivingDomain(): string | null {
  const value = process.env.RESEND_RECEIVING_DOMAIN?.trim().toLowerCase();
  return value && value.length > 0 ? value : null;
}

function buildFallbackCoworkerName(agentDescription: string): string {
  const firstSentence = agentDescription
    .split(/[\n.!?]/)[0]
    ?.replace(/\s+/g, " ")
    .trim();

  if (firstSentence) {
    return firstSentence.slice(0, 128);
  }

  return "New Coworker";
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

const list = protectedProcedure.handler(async ({ context }) => {
  const coworkers = await context.db.query.coworker.findMany({
    where: eq(coworker.ownerId, context.user.id),
    orderBy: (wf, { desc }) => [desc(wf.updatedAt)],
  });

  const items = await Promise.all(
    coworkers.map(async (wf) => {
      const runs = await context.db.query.coworkerRun.findMany({
        where: eq(coworkerRun.coworkerId, wf.id),
        orderBy: (run, { desc }) => [desc(run.startedAt)],
        limit: 20,
      });
      const lastRun = runs[0];

      return {
        id: wf.id,
        name: wf.name,
        status: wf.status,
        autoApprove: wf.autoApprove,
        triggerType: wf.triggerType,
        allowedIntegrations: wf.allowedIntegrations,
        allowedCustomIntegrations: wf.allowedCustomIntegrations,
        schedule: wf.schedule,
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
    const wf = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)),
    });

    if (!wf) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

    const runs = await context.db.query.coworkerRun.findMany({
      where: eq(coworkerRun.coworkerId, wf.id),
      orderBy: (run, { desc }) => [desc(run.startedAt)],
      limit: 20,
    });

    return {
      id: wf.id,
      name: wf.name,
      status: wf.status,
      autoApprove: wf.autoApprove,
      triggerType: wf.triggerType,
      prompt: wf.prompt,
      promptDo: wf.promptDo,
      promptDont: wf.promptDont,
      allowedIntegrations: wf.allowedIntegrations,
      allowedCustomIntegrations: wf.allowedCustomIntegrations,
      schedule: wf.schedule,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
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
      triggerType: triggerTypeSchema,
      prompt: z.string().max(20000),
      promptDo: z.string().max(2000).optional(),
      promptDont: z.string().max(2000).optional(),
      autoApprove: z.boolean().optional(),
      allowedIntegrations: z.array(integrationTypeSchema).default(ALL_INTEGRATION_TYPES),
      allowedCustomIntegrations: z.array(z.string()).default([]),
      schedule: scheduleSchema.nullish(),
    }),
  )
  .handler(async ({ input, context }) => {
    const providedName = input.name?.trim();
    const hasAgentDescription = input.prompt.trim().length > 0;
    const generatedName =
      (!providedName || providedName.length === 0) && hasAgentDescription
        ? await generateCoworkerName({
            agentDescription: input.prompt,
            triggerType: input.triggerType,
            allowedIntegrations: input.allowedIntegrations,
            allowedCustomIntegrations: input.allowedCustomIntegrations,
            schedule: input.schedule ?? null,
            autoApprove: input.autoApprove ?? true,
            promptDo: input.promptDo ?? null,
            promptDont: input.promptDont ?? null,
          })
        : null;
    const nameToSave =
      providedName && providedName.length > 0
        ? providedName
        : hasAgentDescription
          ? (generatedName ?? buildFallbackCoworkerName(input.prompt))
          : "";

    const [created] = await context.db
      .insert(coworker)
      .values({
        name: nameToSave,
        ownerId: context.user.id,
        status: "on",
        triggerType: input.triggerType,
        prompt: input.prompt,
        promptDo: input.promptDo,
        promptDont: input.promptDont,
        autoApprove: input.autoApprove ?? true,
        allowedIntegrations: input.allowedIntegrations,
        allowedCustomIntegrations: input.allowedCustomIntegrations,
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
      status: created.status,
    };
  });

const update = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      name: z.string().max(128).optional(),
      status: z.enum(["on", "off"]).optional(),
      triggerType: triggerTypeSchema.optional(),
      prompt: z.string().max(20000).optional(),
      promptDo: z.string().max(2000).nullish(),
      promptDont: z.string().max(2000).nullish(),
      autoApprove: z.boolean().optional(),
      allowedIntegrations: z.array(integrationTypeSchema).optional(),
      allowedCustomIntegrations: z.array(z.string()).optional(),
      schedule: scheduleSchema.nullish(),
    }),
  )
  .handler(async ({ input, context }) => {
    const existing = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)),
    });

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

    const updates: Partial<typeof coworker.$inferInsert> = {};
    if (input.name !== undefined) {
      const providedName = input.name.trim();
      if (providedName.length > 0) {
        updates.name = providedName;
      } else {
        const nextPrompt = input.prompt ?? existing.prompt;
        const hasAgentDescription = nextPrompt.trim().length > 0;
        if (!hasAgentDescription) {
          updates.name = "";
        } else {
          const generatedName = await generateCoworkerName({
            agentDescription: nextPrompt,
            triggerType: input.triggerType ?? existing.triggerType,
            allowedIntegrations: input.allowedIntegrations ?? existing.allowedIntegrations,
            allowedCustomIntegrations:
              input.allowedCustomIntegrations ?? existing.allowedCustomIntegrations,
            schedule: input.schedule === undefined ? existing.schedule : (input.schedule ?? null),
            autoApprove: input.autoApprove ?? existing.autoApprove,
            promptDo: input.promptDo === undefined ? existing.promptDo : (input.promptDo ?? null),
            promptDont:
              input.promptDont === undefined ? existing.promptDont : (input.promptDont ?? null),
          });
          updates.name = generatedName ?? buildFallbackCoworkerName(nextPrompt);
        }
      }
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
    if (input.promptDo !== undefined) {
      updates.promptDo = input.promptDo ?? null;
    }
    if (input.promptDont !== undefined) {
      updates.promptDont = input.promptDont ?? null;
    }
    if (input.autoApprove !== undefined) {
      updates.autoApprove = input.autoApprove;
    }
    if (input.allowedIntegrations !== undefined) {
      updates.allowedIntegrations = input.allowedIntegrations;
    }
    if (input.allowedCustomIntegrations !== undefined) {
      updates.allowedCustomIntegrations = input.allowedCustomIntegrations;
    }
    if (input.schedule !== undefined) {
      updates.schedule = input.schedule ?? null;
    }

    const result = await context.db
      .update(coworker)
      .set(updates)
      .where(and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)))
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
    const result = await context.db
      .delete(coworker)
      .where(and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)))
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

const applyBuilderPatch = protectedProcedure
  .input(
    z.object({
      coworkerId: z.string(),
      conversationId: z.string(),
      baseUpdatedAt: z.string().datetime({ offset: true }),
      patch: coworkerBuilderPatchSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    const dbUser = await context.db.query.user.findFirst({
      where: eq(user.id, context.user.id),
      columns: { role: true },
    });

    const result = await applyCoworkerBuilderPatch({
      database: context.db,
      userId: context.user.id,
      userRole: dbUser?.role ?? null,
      coworkerId: input.coworkerId,
      conversationId: input.conversationId,
      baseUpdatedAt: input.baseUpdatedAt,
      patch: input.patch,
    });

    return result;
  });

const trigger = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      payload: z.unknown().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const dbUser = await context.db.query.user.findFirst({
      where: eq(user.id, context.user.id),
      columns: { role: true },
    });

    return triggerCoworkerRun({
      coworkerId: input.id,
      triggerPayload: input.payload ?? {},
      userId: context.user.id,
      userRole: dbUser?.role ?? null,
    });
  });

const getRun = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const run = await context.db.query.coworkerRun.findFirst({
      where: eq(coworkerRun.id, input.id),
    });

    if (!run) {
      throw new ORPCError("NOT_FOUND", { message: "Run not found" });
    }

    const wf = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, run.coworkerId), eq(coworker.ownerId, context.user.id)),
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
          },
        })
      : null;

    return {
      id: run.id,
      coworkerId: run.coworkerId,
      status: run.status,
      triggerPayload: run.triggerPayload,
      generationId: run.generationId,
      conversationId: gen?.conversationId ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errorMessage: run.errorMessage,
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
    const wf = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.coworkerId), eq(coworker.ownerId, context.user.id)),
    });

    if (!wf) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

    const runs = await context.db.query.coworkerRun.findMany({
      where: eq(coworkerRun.coworkerId, wf.id),
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
    const wf = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)),
      columns: { id: true, triggerType: true },
    });

    if (!wf) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

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

    const wf = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)),
      columns: { id: true, triggerType: true },
    });

    if (!wf) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

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
    const wf = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)),
      columns: { id: true },
    });

    if (!wf) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

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

    const wf = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)),
      columns: { id: true, triggerType: true },
    });

    if (!wf) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

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

const getOrCreateBuilderConversation = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const wf = await context.db.query.coworker.findFirst({
      where: and(eq(coworker.id, input.id), eq(coworker.ownerId, context.user.id)),
      columns: { id: true, name: true, builderConversationId: true },
    });

    if (!wf) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }

    // Return existing conversation if it still exists
    if (wf.builderConversationId) {
      const existing = await context.db.query.conversation.findFirst({
        where: eq(conversation.id, wf.builderConversationId),
        columns: { id: true },
      });
      if (existing) {
        return { conversationId: existing.id };
      }
    }

    // Create a new builder conversation
    const [created] = await context.db
      .insert(conversation)
      .values({
        userId: context.user.id,
        type: "coworker",
        title: `${wf.name || "Coworker"} – Chat`,
        autoApprove: true,
      })
      .returning({ id: conversation.id });

    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create conversation" });
    }

    await context.db
      .update(coworker)
      .set({ builderConversationId: created.id })
      .where(eq(coworker.id, wf.id));

    return { conversationId: created.id };
  });

export const coworkerRouter = {
  list,
  get,
  create,
  update,
  applyBuilderPatch,
  delete: del,
  trigger,
  getRun,
  listRuns,
  getForwardingAlias,
  createForwardingAlias,
  disableForwardingAlias,
  rotateForwardingAlias,
  getOrCreateBuilderConversation,
};
