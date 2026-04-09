import { orgChartNode } from "@cmdclaw/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../middleware";
import { requireActiveWorkspaceAccess } from "../workspace-access";

const list = protectedProcedure.handler(async ({ context }) => {
  const {
    workspace: { id: workspaceId },
  } = await requireActiveWorkspaceAccess(context.user.id);

  return context.db.query.orgChartNode.findMany({
    where: eq(orgChartNode.workspaceId, workspaceId),
  });
});

const create = protectedProcedure
  .input(
    z.object({
      type: z.enum(["coworker", "label"]),
      coworkerId: z.string().optional(),
      label: z.string().optional(),
      positionX: z.number(),
      positionY: z.number(),
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    const [node] = await context.db
      .insert(orgChartNode)
      .values({
        workspaceId,
        type: input.type,
        coworkerId: input.type === "coworker" ? input.coworkerId : null,
        label: input.type === "label" ? (input.label ?? "New label") : null,
        positionX: Math.round(input.positionX),
        positionY: Math.round(input.positionY),
      })
      .returning();

    return node;
  });

const updatePosition = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      positionX: z.number(),
      positionY: z.number(),
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    await context.db
      .update(orgChartNode)
      .set({
        positionX: Math.round(input.positionX),
        positionY: Math.round(input.positionY),
      })
      .where(and(eq(orgChartNode.id, input.id), eq(orgChartNode.workspaceId, workspaceId)));
  });

const updateLabel = protectedProcedure
  .input(
    z.object({
      id: z.string(),
      label: z.string(),
    }),
  )
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    await context.db
      .update(orgChartNode)
      .set({ label: input.label })
      .where(
        and(
          eq(orgChartNode.id, input.id),
          eq(orgChartNode.workspaceId, workspaceId),
          eq(orgChartNode.type, "label"),
        ),
      );
  });

const del = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const {
      workspace: { id: workspaceId },
    } = await requireActiveWorkspaceAccess(context.user.id);

    await context.db
      .delete(orgChartNode)
      .where(and(eq(orgChartNode.id, input.id), eq(orgChartNode.workspaceId, workspaceId)));
  });

export const orgChartRouter = {
  list,
  create,
  updatePosition,
  updateLabel,
  delete: del,
};
