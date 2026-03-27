import {
  computeWorkspaceExecutorSourceRevisionHash,
  ensureWorkspaceExecutorPackage,
  listWorkspaceExecutorSources,
  normalizeExecutorNamespace,
  setWorkspaceExecutorSourceCredential,
} from "@cmdclaw/core/server/executor/workspace-sources";
import { workspaceExecutorSource, workspaceExecutorSourceCredential } from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../middleware";
import { requireActiveWorkspaceAccess, requireActiveWorkspaceAdmin } from "../workspace-access";

const stringMapSchema = z.record(z.string(), z.string()).default({});
const executorSourceKindSchema = z.enum(["mcp", "openapi"]);
const executorSourceAuthTypeSchema = z.enum(["none", "api_key", "bearer"]);

const executorSourceInputSchema = z
  .object({
    kind: executorSourceKindSchema,
    name: z.string().min(1).max(120),
    namespace: z.string().min(1).max(120),
    endpoint: z.string().url(),
    specUrl: z.string().url().nullish(),
    transport: z.string().max(120).nullish(),
    headers: stringMapSchema.optional(),
    queryParams: stringMapSchema.optional(),
    defaultHeaders: stringMapSchema.optional(),
    authType: executorSourceAuthTypeSchema.default("none"),
    authHeaderName: z.string().max(120).nullish(),
    authQueryParam: z.string().max(120).nullish(),
    authPrefix: z.string().max(120).nullish(),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "openapi" && !value.specUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specUrl"],
        message: "specUrl is required for OpenAPI sources.",
      });
    }

    if (value.kind === "openapi" && value.authQueryParam?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authQueryParam"],
        message: "OpenAPI sources currently support header-based auth only.",
      });
    }
  });

function normalizeStringMap(
  value: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!value) {
    return null;
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key.trim(), entryValue.trim()] as const)
    .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

const list = protectedProcedure.handler(async ({ context }) => {
  const access = await requireActiveWorkspaceAccess(context.user.id);
  const sources = await listWorkspaceExecutorSources({
    database: context.db,
    workspaceId: access.workspace.id,
    userId: context.user.id,
  });
  const packageRow = await ensureWorkspaceExecutorPackage({
    database: context.db,
    workspaceId: access.workspace.id,
    workspaceName: access.workspace.name,
  });

  return {
    workspaceId: access.workspace.id,
    membershipRole: access.membership.role,
    packageRevisionHash: packageRow.revisionHash,
    sources,
  };
});

const create = protectedProcedure
  .input(executorSourceInputSchema)
  .handler(async ({ input, context }) => {
    const access = await requireActiveWorkspaceAdmin(context.user.id);
    const namespace = normalizeExecutorNamespace(input.namespace);
    const existing = await context.db.query.workspaceExecutorSource.findFirst({
      where: and(
        eq(workspaceExecutorSource.workspaceId, access.workspace.id),
        eq(workspaceExecutorSource.namespace, namespace),
      ),
    });

    if (existing) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Source namespace "${namespace}" already exists in this workspace.`,
      });
    }

    const revisionHash = computeWorkspaceExecutorSourceRevisionHash({
      kind: input.kind,
      name: input.name,
      namespace,
      endpoint: input.endpoint,
      specUrl: input.specUrl ?? null,
      transport: input.transport ?? null,
      headers: normalizeStringMap(input.headers),
      queryParams: normalizeStringMap(input.queryParams),
      defaultHeaders: normalizeStringMap(input.defaultHeaders),
      authType: input.authType,
      authHeaderName: input.authHeaderName?.trim() || null,
      authQueryParam: input.authQueryParam?.trim() || null,
      authPrefix: input.authPrefix ?? null,
      enabled: input.enabled,
    });

    const [created] = await context.db
      .insert(workspaceExecutorSource)
      .values({
        workspaceId: access.workspace.id,
        kind: input.kind,
        name: input.name.trim(),
        namespace,
        endpoint: input.endpoint.trim(),
        specUrl: input.kind === "openapi" ? (input.specUrl?.trim() ?? null) : null,
        transport: input.kind === "mcp" ? (input.transport?.trim() ?? null) : null,
        headers: input.kind === "mcp" ? normalizeStringMap(input.headers) : null,
        queryParams: input.kind === "mcp" ? normalizeStringMap(input.queryParams) : null,
        defaultHeaders: input.kind === "openapi" ? normalizeStringMap(input.defaultHeaders) : null,
        authType: input.authType,
        authHeaderName: input.authHeaderName?.trim() || null,
        authQueryParam: input.kind === "mcp" ? input.authQueryParam?.trim() || null : null,
        authPrefix: input.authPrefix ?? null,
        enabled: input.enabled,
        revisionHash,
        createdByUserId: context.user.id,
        updatedByUserId: context.user.id,
      })
      .returning();

    await ensureWorkspaceExecutorPackage({
      database: context.db,
      workspaceId: access.workspace.id,
      workspaceName: access.workspace.name,
    });

    return { id: created.id };
  });

const update = protectedProcedure
  .input(executorSourceInputSchema.extend({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const access = await requireActiveWorkspaceAdmin(context.user.id);
    const current = await context.db.query.workspaceExecutorSource.findFirst({
      where: and(
        eq(workspaceExecutorSource.id, input.id),
        eq(workspaceExecutorSource.workspaceId, access.workspace.id),
      ),
    });

    if (!current) {
      throw new ORPCError("NOT_FOUND", { message: "Executor source not found." });
    }

    const namespace = normalizeExecutorNamespace(input.namespace);
    const duplicate = await context.db.query.workspaceExecutorSource.findFirst({
      where: and(
        eq(workspaceExecutorSource.workspaceId, access.workspace.id),
        eq(workspaceExecutorSource.namespace, namespace),
      ),
    });

    if (duplicate && duplicate.id !== input.id) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Source namespace "${namespace}" already exists in this workspace.`,
      });
    }

    const revisionHash = computeWorkspaceExecutorSourceRevisionHash({
      kind: input.kind,
      name: input.name,
      namespace,
      endpoint: input.endpoint,
      specUrl: input.specUrl ?? null,
      transport: input.transport ?? null,
      headers: normalizeStringMap(input.headers),
      queryParams: normalizeStringMap(input.queryParams),
      defaultHeaders: normalizeStringMap(input.defaultHeaders),
      authType: input.authType,
      authHeaderName: input.authHeaderName?.trim() || null,
      authQueryParam: input.authQueryParam?.trim() || null,
      authPrefix: input.authPrefix ?? null,
      enabled: input.enabled,
    });

    await context.db
      .update(workspaceExecutorSource)
      .set({
        kind: input.kind,
        name: input.name.trim(),
        namespace,
        endpoint: input.endpoint.trim(),
        specUrl: input.kind === "openapi" ? (input.specUrl?.trim() ?? null) : null,
        transport: input.kind === "mcp" ? (input.transport?.trim() ?? null) : null,
        headers: input.kind === "mcp" ? normalizeStringMap(input.headers) : null,
        queryParams: input.kind === "mcp" ? normalizeStringMap(input.queryParams) : null,
        defaultHeaders: input.kind === "openapi" ? normalizeStringMap(input.defaultHeaders) : null,
        authType: input.authType,
        authHeaderName: input.authHeaderName?.trim() || null,
        authQueryParam: input.kind === "mcp" ? input.authQueryParam?.trim() || null : null,
        authPrefix: input.authPrefix ?? null,
        enabled: input.enabled,
        revisionHash,
        updatedByUserId: context.user.id,
      })
      .where(eq(workspaceExecutorSource.id, input.id));

    await ensureWorkspaceExecutorPackage({
      database: context.db,
      workspaceId: access.workspace.id,
      workspaceName: access.workspace.name,
    });

    return { success: true };
  });

const remove = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const access = await requireActiveWorkspaceAdmin(context.user.id);
    const deleted = await context.db
      .delete(workspaceExecutorSource)
      .where(
        and(
          eq(workspaceExecutorSource.id, input.id),
          eq(workspaceExecutorSource.workspaceId, access.workspace.id),
        ),
      )
      .returning({ id: workspaceExecutorSource.id });

    if (deleted.length === 0) {
      throw new ORPCError("NOT_FOUND", { message: "Executor source not found." });
    }

    await ensureWorkspaceExecutorPackage({
      database: context.db,
      workspaceId: access.workspace.id,
      workspaceName: access.workspace.name,
    });

    return { success: true };
  });

const setCredential = protectedProcedure
  .input(
    z.object({
      workspaceExecutorSourceId: z.string(),
      secret: z.string().min(1),
      displayName: z.string().max(120).nullish(),
      enabled: z.boolean().default(true),
    }),
  )
  .handler(async ({ input, context }) => {
    const access = await requireActiveWorkspaceAccess(context.user.id);
    const source = await context.db.query.workspaceExecutorSource.findFirst({
      where: and(
        eq(workspaceExecutorSource.id, input.workspaceExecutorSourceId),
        eq(workspaceExecutorSource.workspaceId, access.workspace.id),
      ),
    });

    if (!source) {
      throw new ORPCError("NOT_FOUND", { message: "Executor source not found." });
    }

    await setWorkspaceExecutorSourceCredential({
      database: context.db,
      workspaceExecutorSourceId: source.id,
      userId: context.user.id,
      secret: input.secret,
      displayName: input.displayName,
      enabled: input.enabled,
    });

    return { success: true };
  });

const disconnectCredential = protectedProcedure
  .input(z.object({ workspaceExecutorSourceId: z.string() }))
  .handler(async ({ input, context }) => {
    const access = await requireActiveWorkspaceAccess(context.user.id);
    const source = await context.db.query.workspaceExecutorSource.findFirst({
      where: and(
        eq(workspaceExecutorSource.id, input.workspaceExecutorSourceId),
        eq(workspaceExecutorSource.workspaceId, access.workspace.id),
      ),
    });

    if (!source) {
      throw new ORPCError("NOT_FOUND", { message: "Executor source not found." });
    }

    await context.db
      .delete(workspaceExecutorSourceCredential)
      .where(
        and(
          eq(workspaceExecutorSourceCredential.workspaceExecutorSourceId, source.id),
          eq(workspaceExecutorSourceCredential.userId, context.user.id),
        ),
      );

    return { success: true };
  });

const toggleCredential = protectedProcedure
  .input(
    z.object({
      workspaceExecutorSourceId: z.string(),
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ input, context }) => {
    const access = await requireActiveWorkspaceAccess(context.user.id);
    const source = await context.db.query.workspaceExecutorSource.findFirst({
      where: and(
        eq(workspaceExecutorSource.id, input.workspaceExecutorSourceId),
        eq(workspaceExecutorSource.workspaceId, access.workspace.id),
      ),
    });

    if (!source) {
      throw new ORPCError("NOT_FOUND", { message: "Executor source not found." });
    }

    const updated = await context.db
      .update(workspaceExecutorSourceCredential)
      .set({
        enabled: input.enabled,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workspaceExecutorSourceCredential.workspaceExecutorSourceId, source.id),
          eq(workspaceExecutorSourceCredential.userId, context.user.id),
        ),
      )
      .returning({ id: workspaceExecutorSourceCredential.id });

    if (updated.length === 0) {
      throw new ORPCError("NOT_FOUND", { message: "Executor source credential not found." });
    }

    return { success: true };
  });

export const executorSourceRouter = {
  list,
  create,
  update,
  delete: remove,
  setCredential,
  disconnectCredential,
  toggleCredential,
};
