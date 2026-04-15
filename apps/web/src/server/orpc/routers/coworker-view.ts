import { coworkerView } from "@cmdclaw/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../middleware";
import { requireActiveWorkspaceAccess } from "../workspace-access";

const filtersSchema = z.object({
  tagIds: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  triggerTypes: z.array(z.string()).optional(),
});

const list = protectedProcedure.handler(async ({ context }) => {
  const {
    workspace: { id: workspaceId },
  } = await requireActiveWorkspaceAccess(context.user.id);

  return context.db.query.coworkerView.findMany({
    where: eq(coworkerView.workspaceId, workspaceId),
    orderBy: (v, { asc }) => [asc(v.position)],
  });
});

const create = protectedProcedure
  .input(
    z.object({
      name: z.string().min(1).max(100),
      filters: filtersSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    const [view] = await context.db
      .insert(coworkerView)
      .values({
        workspaceId,
        name: input.name,
        filters: input.filters,
      })
      .returning();

    return view;
  });

const update = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      name: z.string().min(1).max(100).optional(),
      filters: filtersSchema.optional(),
      position: z.number().int().min(0).optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    const updates: Partial<{
      name: string;
      filters: z.infer<typeof filtersSchema>;
      position: number;
    }> = {};
    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (input.filters !== undefined) {
      updates.filters = input.filters;
    }
    if (input.position !== undefined) {
      updates.position = input.position;
    }

    const [view] = await context.db
      .update(coworkerView)
      .set(updates)
      .where(and(eq(coworkerView.id, input.id), eq(coworkerView.workspaceId, workspaceId)))
      .returning();

    return view;
  });

const del = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    await context.db
      .delete(coworkerView)
      .where(and(eq(coworkerView.id, input.id), eq(coworkerView.workspaceId, workspaceId)));

    return { success: true as const };
  });

export const coworkerViewRouter = {
  list,
  create,
  update,
  delete: del,
};
