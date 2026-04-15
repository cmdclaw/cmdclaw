import { coworkerTag, coworkerTagAssignment } from "@cmdclaw/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../middleware";
import { requireActiveWorkspaceAccess } from "../workspace-access";

const list = protectedProcedure.handler(async ({ context }) => {
  const {
    workspace: { id: workspaceId },
  } = await requireActiveWorkspaceAccess(context.user.id);

  const tags = await context.db.query.coworkerTag.findMany({
    where: eq(coworkerTag.workspaceId, workspaceId),
    with: { assignments: true },
  });

  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    coworkerCount: tag.assignments.length,
  }));
});

const create = protectedProcedure
  .input(
    z.object({
      name: z.string().min(1).max(50),
      color: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    const [tag] = await context.db
      .insert(coworkerTag)
      .values({
        workspaceId,
        name: input.name,
        color: input.color ?? null,
      })
      .returning();

    return tag;
  });

const update = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      name: z.string().min(1).max(50).optional(),
      color: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    const updates: Partial<{ name: string; color: string | null }> = {};
    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (input.color !== undefined) {
      updates.color = input.color;
    }

    const [tag] = await context.db
      .update(coworkerTag)
      .set(updates)
      .where(and(eq(coworkerTag.id, input.id), eq(coworkerTag.workspaceId, workspaceId)))
      .returning();

    return tag;
  });

const del = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    await context.db
      .delete(coworkerTag)
      .where(and(eq(coworkerTag.id, input.id), eq(coworkerTag.workspaceId, workspaceId)));

    return { success: true as const };
  });

const assign = protectedProcedure
  .input(
    z.object({
      coworkerId: z.string(),
      tagIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ input, context }) => {
    await requireActiveWorkspaceAccess(context.user.id);

    await context.db
      .insert(coworkerTagAssignment)
      .values(input.tagIds.map((tagId) => ({ coworkerId: input.coworkerId, tagId })))
      .onConflictDoNothing();

    return { success: true as const };
  });

const unassign = protectedProcedure
  .input(
    z.object({
      coworkerId: z.string(),
      tagIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ input, context }) => {
    await requireActiveWorkspaceAccess(context.user.id);

    await context.db
      .delete(coworkerTagAssignment)
      .where(
        and(
          eq(coworkerTagAssignment.coworkerId, input.coworkerId),
          inArray(coworkerTagAssignment.tagId, input.tagIds),
        ),
      );

    return { success: true as const };
  });

export const coworkerTagRouter = {
  list,
  create,
  update,
  delete: del,
  assign,
  unassign,
};
