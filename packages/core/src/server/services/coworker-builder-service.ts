import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z, type ZodIssue } from "zod";
import { EMAIL_FORWARDED_TRIGGER_TYPE } from "../../lib/email-forwarding";
import {
  COWORKER_TOOL_ACCESS_MODES,
  normalizeCoworkerToolAccessMode,
  type CoworkerToolAccessMode,
} from "../../lib/coworker-tool-policy";
import { coworker } from "@cmdclaw/db/schema";
import { generateCoworkerMetadataOnFirstPromptFill } from "./coworker-metadata";
import { syncCoworkerScheduleJob } from "./coworker-scheduler";

const BUILDER_ALLOWED_TRIGGER_TYPES = [
  "manual",
  "schedule",
  EMAIL_FORWARDED_TRIGGER_TYPE,
  "gmail.new_email",
  "twitter.new_dm",
] as const;

export const coworkerBuilderScheduleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("interval"),
    intervalMinutes: z.number().min(60).max(10080),
  }),
  z.object({
    type: z.literal("daily"),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    timezone: z.string().default("UTC"),
  }),
  z.object({
    type: z.literal("weekly"),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    daysOfWeek: z.array(z.number().min(0).max(6)).min(1),
    timezone: z.string().default("UTC"),
  }),
  z.object({
    type: z.literal("monthly"),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    dayOfMonth: z.number().min(1).max(31),
    timezone: z.string().default("UTC"),
  }),
]);

export const coworkerBuilderPatchSchema = z
  .object({
    prompt: z.string().max(20000).optional(),
    toolAccessMode: z.enum(COWORKER_TOOL_ACCESS_MODES).optional(),
    allowedIntegrations: z.array(z.string()).min(1).optional(),
    triggerType: z.enum(BUILDER_ALLOWED_TRIGGER_TYPES).optional(),
    schedule: coworkerBuilderScheduleSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.prompt !== undefined ||
      value.toolAccessMode !== undefined ||
      value.allowedIntegrations !== undefined ||
      value.triggerType !== undefined ||
      value.schedule !== undefined,
    {
      message: "Patch must include at least one editable field",
    },
  );

export const coworkerBuilderPatchEnvelopeSchema = z
  .object({
    baseUpdatedAt: z.string().datetime({ offset: true }),
    patch: coworkerBuilderPatchSchema,
  })
  .strict();

export type CoworkerBuilderPatchEnvelope = z.infer<typeof coworkerBuilderPatchEnvelopeSchema>;
export type CoworkerBuilderPatch = z.infer<typeof coworkerBuilderPatchSchema>;

export type CoworkerBuilderContext = {
  coworkerId: string;
  updatedAt: string;
  prompt: string;
  toolAccessMode: CoworkerToolAccessMode;
  triggerType: string;
  schedule: unknown;
  allowedIntegrations: string[];
};

type DatabaseLike = unknown;

type CoworkerBuilderApplyResult =
  | {
      status: "applied";
      coworker: CoworkerBuilderContext;
      appliedChanges: string[];
    }
  | {
      status: "conflict";
      coworker: CoworkerBuilderContext;
      message: string;
    }
  | {
      status: "validation_error";
      message: string;
      details: string[];
    };

const coworkerBuilderRowSchema = z.object({
  id: z.string(),
  ownerId: z.string().optional(),
  builderConversationId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  prompt: z.string(),
  promptDo: z.string().nullable().optional(),
  promptDont: z.string().nullable().optional(),
  toolAccessMode: z.enum(COWORKER_TOOL_ACCESS_MODES).nullable().optional(),
  triggerType: z.string(),
  schedule: z.unknown().nullable().optional(),
  allowedIntegrations: z.array(z.string()),
  allowedCustomIntegrations: z.array(z.string()).optional(),
  autoApprove: z.boolean().optional(),
  updatedAt: z.date(),
});

const coworkerBuilderContextRowSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  toolAccessMode: z.enum(COWORKER_TOOL_ACCESS_MODES).nullable().optional(),
  triggerType: z.string(),
  schedule: z.unknown().nullable().optional(),
  allowedIntegrations: z.array(z.string()),
  updatedAt: z.date(),
});

const coworkerBuilderUpdatedRowSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  toolAccessMode: z.enum(COWORKER_TOOL_ACCESS_MODES).nullable().optional(),
  triggerType: z.string(),
  schedule: z.unknown().nullable().optional(),
  allowedIntegrations: z.array(z.string()),
  updatedAt: z.date(),
  status: z.enum(["on", "off"]),
});

function normalizeIntegrations(input: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of input) {
    const trimmed = value.trim().replace(/-/g, "_");
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function toBuilderContext(row: {
  id: string;
  prompt: string;
  toolAccessMode: CoworkerToolAccessMode | null | undefined;
  triggerType: string;
  schedule: unknown;
  allowedIntegrations: string[];
  updatedAt: Date;
}): CoworkerBuilderContext {
  return {
    coworkerId: row.id,
    updatedAt: row.updatedAt.toISOString(),
    prompt: row.prompt,
    toolAccessMode: normalizeCoworkerToolAccessMode(row.toolAccessMode, row.allowedIntegrations),
    triggerType: row.triggerType,
    schedule: row.schedule,
    allowedIntegrations: row.allowedIntegrations,
  };
}

export async function resolveCoworkerBuilderContextByConversation(params: {
  database: DatabaseLike;
  userId: string;
  conversationId: string;
}): Promise<CoworkerBuilderContext | null> {
  const database = params.database as {
    query: {
      coworker: {
        findFirst: (args: unknown) => Promise<unknown>;
      };
    };
  };
  const rowUnknown = await database.query.coworker.findFirst({
    where: and(
      eq(coworker.ownerId, params.userId),
      eq(coworker.builderConversationId, params.conversationId),
    ),
    columns: {
      id: true,
      prompt: true,
      toolAccessMode: true,
      triggerType: true,
      schedule: true,
      allowedIntegrations: true,
      updatedAt: true,
    },
  });

  if (!rowUnknown) {
    return null;
  }
  const row = coworkerBuilderContextRowSchema.parse(rowUnknown);

  return toBuilderContext({
    id: row.id,
    prompt: row.prompt,
    toolAccessMode: row.toolAccessMode,
    triggerType: row.triggerType,
    schedule: row.schedule,
    allowedIntegrations: row.allowedIntegrations as string[],
    updatedAt: row.updatedAt,
  });
}

function buildChangedFields(params: {
    current: {
      name: string;
      description: string | null;
      username: string | null;
      prompt: string;
      toolAccessMode: CoworkerToolAccessMode;
      triggerType: string;
      schedule: unknown;
      allowedIntegrations: string[];
  };
  next: {
      name: string;
      description: string | null;
      username: string | null;
      prompt: string;
      toolAccessMode: CoworkerToolAccessMode;
      triggerType: string;
      schedule: unknown;
      allowedIntegrations: string[];
  };
}): string[] {
  const changed: string[] = [];
  if (params.current.name !== params.next.name) {
    changed.push("name");
  }
  if (params.current.description !== params.next.description) {
    changed.push("description");
  }
  if (params.current.username !== params.next.username) {
    changed.push("username");
  }
  if (params.current.prompt !== params.next.prompt) {
    changed.push("prompt");
  }
  if (params.current.toolAccessMode !== params.next.toolAccessMode) {
    changed.push("toolAccessMode");
  }
  if (params.current.triggerType !== params.next.triggerType) {
    changed.push("triggerType");
  }
  if (JSON.stringify(params.current.schedule) !== JSON.stringify(params.next.schedule)) {
    changed.push("schedule");
  }
  if (
    JSON.stringify([...params.current.allowedIntegrations].toSorted()) !==
    JSON.stringify([...params.next.allowedIntegrations].toSorted())
  ) {
    changed.push("allowedIntegrations");
  }
  return changed;
}

export async function applyCoworkerBuilderPatch(params: {
  database: DatabaseLike;
  userId: string;
  userRole: string | null;
  coworkerId: string;
  conversationId: string;
  baseUpdatedAt: string;
  patch: CoworkerBuilderPatch;
}): Promise<CoworkerBuilderApplyResult> {
  const database = params.database as {
    query: {
      coworker: {
        findFirst: (args: unknown) => Promise<unknown>;
      };
    };
    update: (table: typeof coworker) => {
      set: (values: Partial<typeof coworker.$inferInsert>) => {
        where: (clause: unknown) => {
          returning: (columns: unknown) => Promise<unknown[]>;
        };
      };
    };
  };

  const existingUnknown = await database.query.coworker.findFirst({
    where: and(eq(coworker.id, params.coworkerId), eq(coworker.ownerId, params.userId)),
    columns: {
      id: true,
      ownerId: true,
      builderConversationId: true,
      name: true,
      description: true,
      username: true,
      prompt: true,
      promptDo: true,
      promptDont: true,
      toolAccessMode: true,
      triggerType: true,
      schedule: true,
      allowedIntegrations: true,
      allowedCustomIntegrations: true,
      autoApprove: true,
      updatedAt: true,
    },
  });

  if (!existingUnknown) {
    throw new ORPCError("NOT_FOUND", { message: "Coworker builder context not found" });
  }
  const existing = coworkerBuilderRowSchema.parse(existingUnknown);

  if (existing.builderConversationId !== params.conversationId) {
    throw new ORPCError("NOT_FOUND", { message: "Coworker builder context not found" });
  }

  const normalizedIntegrations =
    params.patch.allowedIntegrations !== undefined
      ? normalizeIntegrations(params.patch.allowedIntegrations)
      : undefined;
  if (normalizedIntegrations !== undefined && normalizedIntegrations.length === 0) {
    return {
      status: "validation_error",
      message: "Validation failed",
      details: ["allowedIntegrations must include at least one integration"],
    };
  }

  const nextTriggerType = params.patch.triggerType ?? existing.triggerType;
  const nextToolAccessMode =
    params.patch.toolAccessMode ??
    normalizeCoworkerToolAccessMode(existing.toolAccessMode, existing.allowedIntegrations);
  const nextSchedule =
    params.patch.schedule !== undefined ? params.patch.schedule : (existing.schedule ?? null);
  const details: string[] = [];

  if (
    !BUILDER_ALLOWED_TRIGGER_TYPES.includes(
      nextTriggerType as (typeof BUILDER_ALLOWED_TRIGGER_TYPES)[number],
    )
  ) {
    details.push(`Unsupported triggerType "${nextTriggerType}"`);
  }
  if (nextTriggerType === "schedule" && !nextSchedule) {
    details.push("schedule is required when triggerType is schedule");
  }
  if (nextTriggerType === "twitter.new_dm" && params.userRole !== "admin") {
    details.push("twitter.new_dm trigger requires admin role");
  }
  if (details.length > 0) {
    return {
      status: "validation_error",
      message: "Validation failed",
      details,
    };
  }

  const nextState = {
    name: existing.name,
    description: existing.description ?? null,
    username: existing.username ?? null,
    prompt: params.patch.prompt ?? existing.prompt,
    toolAccessMode: nextToolAccessMode,
    triggerType: nextTriggerType,
    schedule:
      nextTriggerType === "schedule"
        ? nextSchedule
        : params.patch.schedule !== undefined
          ? params.patch.schedule
          : (existing.schedule ?? null),
    allowedIntegrations: normalizedIntegrations ?? (existing.allowedIntegrations as string[]),
  };
  const metadataUpdates = await generateCoworkerMetadataOnFirstPromptFill({
    database,
    current: {
      id: existing.id,
      name: existing.name,
      description: existing.description ?? null,
      username: existing.username ?? null,
      prompt: existing.prompt,
      triggerType: existing.triggerType,
      allowedIntegrations: existing.allowedIntegrations as string[],
      allowedCustomIntegrations: existing.allowedCustomIntegrations ?? [],
      schedule: existing.schedule ?? null,
      autoApprove: existing.autoApprove ?? true,
      promptDo: existing.promptDo ?? null,
      promptDont: existing.promptDont ?? null,
    },
    next: {
      id: existing.id,
      name: nextState.name,
      description: nextState.description,
      username: nextState.username,
      prompt: nextState.prompt,
      triggerType: nextState.triggerType,
      allowedIntegrations: nextState.allowedIntegrations,
      allowedCustomIntegrations: existing.allowedCustomIntegrations ?? [],
      schedule: nextState.schedule,
      autoApprove: existing.autoApprove ?? true,
      promptDo: existing.promptDo ?? null,
      promptDont: existing.promptDont ?? null,
    },
  });
  nextState.name = metadataUpdates.name ?? nextState.name;
  nextState.description = metadataUpdates.description ?? nextState.description;
  nextState.username = metadataUpdates.username ?? nextState.username;

  const changedFields = buildChangedFields({
    current: {
      name: existing.name,
      description: existing.description ?? null,
      username: existing.username ?? null,
      prompt: existing.prompt,
      toolAccessMode: normalizeCoworkerToolAccessMode(
        existing.toolAccessMode,
        existing.allowedIntegrations as string[],
      ),
      triggerType: existing.triggerType,
      schedule: existing.schedule ?? null,
      allowedIntegrations: existing.allowedIntegrations as string[],
    },
    next: nextState,
  });

  if (changedFields.length === 0) {
    return {
      status: "applied",
      coworker: toBuilderContext({
        id: existing.id,
        prompt: existing.prompt,
        toolAccessMode: existing.toolAccessMode,
        triggerType: existing.triggerType,
        schedule: existing.schedule ?? null,
        allowedIntegrations: existing.allowedIntegrations as string[],
        updatedAt: existing.updatedAt,
      }),
      appliedChanges: [],
    };
  }

  const updatedRowsUnknown = await database
    .update(coworker)
    .set({
      name: nextState.name,
      description: nextState.description,
      username: nextState.username,
      prompt: nextState.prompt,
      toolAccessMode: nextState.toolAccessMode,
      triggerType: nextState.triggerType,
      schedule: nextState.schedule,
      allowedIntegrations:
        nextState.allowedIntegrations as (typeof coworker.$inferInsert)["allowedIntegrations"],
    })
    .where(
      and(
        eq(coworker.id, existing.id),
        eq(coworker.ownerId, params.userId),
        eq(coworker.builderConversationId, params.conversationId),
        eq(coworker.updatedAt, new Date(params.baseUpdatedAt)),
      ),
    )
    .returning({
      id: coworker.id,
      prompt: coworker.prompt,
      toolAccessMode: coworker.toolAccessMode,
      triggerType: coworker.triggerType,
      schedule: coworker.schedule,
      allowedIntegrations: coworker.allowedIntegrations,
      updatedAt: coworker.updatedAt,
      status: coworker.status,
    });
  const updatedRows = z.array(coworkerBuilderUpdatedRowSchema).parse(updatedRowsUnknown);
  const updated = updatedRows[0];

  if (!updated) {
    const latestUnknown = await database.query.coworker.findFirst({
      where: and(eq(coworker.id, existing.id), eq(coworker.ownerId, params.userId)),
      columns: {
        id: true,
        prompt: true,
        toolAccessMode: true,
        triggerType: true,
        schedule: true,
        allowedIntegrations: true,
        updatedAt: true,
      },
    });
    if (!latestUnknown) {
      throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
    }
    const latest = coworkerBuilderRowSchema.parse(latestUnknown);
    return {
      status: "conflict",
      coworker: toBuilderContext({
        id: latest.id,
        prompt: latest.prompt,
        toolAccessMode: latest.toolAccessMode,
        triggerType: latest.triggerType,
        schedule: latest.schedule ?? null,
        allowedIntegrations: latest.allowedIntegrations as string[],
        updatedAt: latest.updatedAt,
      }),
      message: "Coworker changed since this patch was prepared",
    };
  }

  if (changedFields.includes("triggerType") || changedFields.includes("schedule")) {
    try {
      await syncCoworkerScheduleJob({
        id: updated.id,
        status: updated.status,
        triggerType: updated.triggerType,
        schedule: updated.schedule,
      });
    } catch (error) {
      console.error(
        `[coworker-builder] failed to sync scheduler after patch apply (${updated.id})`,
        error,
      );
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Coworker updated but failed to sync schedule job",
      });
    }
  }

  return {
    status: "applied",
    coworker: toBuilderContext({
      id: updated.id,
      prompt: updated.prompt,
      toolAccessMode: updated.toolAccessMode,
      triggerType: updated.triggerType,
      schedule: updated.schedule,
      allowedIntegrations: updated.allowedIntegrations as string[],
      updatedAt: updated.updatedAt,
    }),
    appliedChanges: changedFields,
  };
}

type CoworkerPatchExtractionResult =
  | {
      status: "none";
      sanitizedText: string;
    }
  | {
      status: "invalid";
      sanitizedText: string;
      message: string;
      rawPatch?: string;
    }
  | {
      status: "ok";
      sanitizedText: string;
      envelope: CoworkerBuilderPatchEnvelope;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeTriggerType(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  if (value === "email_forwarded") {
    return EMAIL_FORWARDED_TRIGGER_TYPE;
  }
  if (value === "hourly") {
    return "schedule";
  }
  return value;
}

function normalizeSchedule(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  if (record.type === "interval" && typeof record.intervalHours === "number") {
    return {
      type: "interval",
      intervalMinutes: Math.trunc(record.intervalHours * 60),
    };
  }

  if (
    typeof record.cron === "string" &&
    (record.cron.trim() === "0 * * * *" || record.cron.trim() === "0 */1 * * *")
  ) {
    return {
      type: "interval",
      intervalMinutes: 60,
    };
  }

  if (record.frequency === "hourly" || record.repeat === "hourly") {
    return {
      type: "interval",
      intervalMinutes: 60,
    };
  }

  return value;
}

function normalizePatchCandidate(parsedUnknown: unknown): unknown {
  const envelope = asRecord(parsedUnknown);
  if (!envelope) {
    return parsedUnknown;
  }
  const patch = asRecord(envelope.patch);
  if (!patch) {
    return parsedUnknown;
  }

  const nextPatch: Record<string, unknown> = { ...patch };
  nextPatch.triggerType = normalizeTriggerType(nextPatch.triggerType);
  if (nextPatch.toolAccessMode === "restrict" || nextPatch.toolAccessMode === "selected") {
    nextPatch.toolAccessMode = "selected";
  } else if (nextPatch.toolAccessMode === "all") {
    nextPatch.toolAccessMode = "all";
  }

  if (!nextPatch.allowedIntegrations) {
    if (Array.isArray(nextPatch.integrations)) {
      nextPatch.allowedIntegrations = nextPatch.integrations;
    } else if (Array.isArray(nextPatch.tools)) {
      nextPatch.allowedIntegrations = nextPatch.tools;
    }
  }
  delete nextPatch.integrations;
  delete nextPatch.tools;

  if (nextPatch.triggerType === "schedule" && nextPatch.schedule === undefined) {
    nextPatch.schedule = { type: "interval", intervalMinutes: 60 };
  }
  if (nextPatch.schedule !== undefined) {
    nextPatch.schedule = normalizeSchedule(nextPatch.schedule);
  }

  return {
    ...envelope,
    patch: nextPatch,
  };
}

function formatIssues(issues: ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function removePatchBlocks(text: string): string {
  return text
    .replace(/```coworker_builder_patch\s*[\s\S]*?```/gi, "")
    .replace(/<coworker_builder_patch>[\s\S]*?<\/coworker_builder_patch>/gi, "")
    .trim();
}

export function extractCoworkerBuilderPatch(text: string): CoworkerPatchExtractionResult {
  const fenceRegex = /```coworker_builder_patch\s*([\s\S]*?)```/gi;
  const tagRegex = /<coworker_builder_patch>([\s\S]*?)<\/coworker_builder_patch>/gi;

  const matches: string[] = [];
  for (const match of text.matchAll(fenceRegex)) {
    matches.push(match[1] ?? "");
  }
  for (const match of text.matchAll(tagRegex)) {
    matches.push(match[1] ?? "");
  }

  const sanitizedText = removePatchBlocks(text);
  if (matches.length === 0) {
    return {
      status: "none",
      sanitizedText,
    };
  }
  if (matches.length > 1) {
    return {
      status: "invalid",
      sanitizedText,
      message: "Multiple coworker patch blocks detected",
      rawPatch: matches.join("\n\n---\n\n").slice(0, 800),
    };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(matches[0] ?? "");
  } catch {
    return {
      status: "invalid",
      sanitizedText,
      message: "Coworker patch block is not valid JSON",
      rawPatch: (matches[0] ?? "").slice(0, 800),
    };
  }

  const normalizedCandidate = normalizePatchCandidate(parsedUnknown);
  let parsed = coworkerBuilderPatchEnvelopeSchema.safeParse(normalizedCandidate);

  if (!parsed.success) {
    const normalizedRecord = asRecord(normalizedCandidate);
    const patch = normalizedRecord ? asRecord(normalizedRecord.patch) : null;
    if (patch && patch.triggerType !== "schedule" && patch.schedule !== undefined) {
      const withoutSchedule = {
        ...normalizedRecord,
        patch: { ...patch },
      };
      delete (withoutSchedule.patch as Record<string, unknown>).schedule;
      parsed = coworkerBuilderPatchEnvelopeSchema.safeParse(withoutSchedule);
    }
  }

  if (!parsed.success) {
    return {
      status: "invalid",
      sanitizedText,
      message: formatIssues(parsed.error.issues),
      rawPatch: JSON.stringify(normalizedCandidate).slice(0, 800),
    };
  }

  return {
    status: "ok",
    sanitizedText,
    envelope: parsed.data,
  };
}
