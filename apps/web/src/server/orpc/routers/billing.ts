import { BILLING_PLANS, type BillingPlanId } from "@cmdclaw/core/lib/billing-plans";
import {
  addWorkspaceMembers,
  attachPlanToOwner,
  cancelPlanForOwner,
  createManualTopUp,
  createWorkspaceForUser,
  ensureWorkspaceForUser,
  getBillingOverviewForUser,
  getWorkspaceMembershipForUser,
  listWorkspaceMembers,
  openBillingPortalForOwner,
  renameWorkspace,
  setActiveWorkspace,
} from "@cmdclaw/core/server/billing/service";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { user, workspace } from "@/server/db/schema";
import { protectedProcedure } from "../middleware";

async function getDbRole(userId: string, db: typeof import("@/server/db/client").db) {
  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { role: true },
  });
  return dbUser?.role ?? "user";
}

async function resolveRequestedOwner(params: {
  userId: string;
  db: typeof import("@/server/db/client").db;
  ownerType: "user" | "workspace";
  workspaceId?: string;
}) {
  if (params.ownerType === "user") {
    throw new ORPCError("BAD_REQUEST", { message: "Personal billing is no longer supported" });
  }

  if (!params.workspaceId) {
    const dbUser = await params.db.query.user.findFirst({
      where: eq(user.id, params.userId),
      columns: { activeWorkspaceId: true },
    });
    const ensuredWorkspace = await ensureWorkspaceForUser(params.userId, dbUser?.activeWorkspaceId);
    return {
      ownerType: "workspace" as const,
      ownerId: ensuredWorkspace.id,
      autumnCustomerId: ensuredWorkspace.autumnCustomerId ?? ensuredWorkspace.id,
      planId: ensuredWorkspace.billingPlanId as BillingPlanId,
    };
  }

  const membership = await getWorkspaceMembershipForUser(params.userId, params.workspaceId);
  if (!membership) {
    throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
  }

  const dbWorkspace = await params.db.query.workspace.findFirst({
    where: eq(workspace.id, params.workspaceId),
    columns: { id: true, autumnCustomerId: true, billingPlanId: true },
  });
  if (!dbWorkspace) {
    throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
  }

  return {
    ownerType: "workspace" as const,
    ownerId: dbWorkspace.id,
    autumnCustomerId: dbWorkspace.autumnCustomerId ?? dbWorkspace.id,
    planId: dbWorkspace.billingPlanId as BillingPlanId,
  };
}

const overview = protectedProcedure.handler(async ({ context }) => {
  return getBillingOverviewForUser(context.user.id);
});

const createWorkspace = protectedProcedure
  .input(
    z.object({
      name: z.string().trim().min(2).max(80),
    }),
  )
  .handler(async ({ input, context }) => {
    const created = await createWorkspaceForUser(context.user.id, input.name);
    return {
      id: created.id,
      name: created.name,
      billingPlanId: created.billingPlanId,
    };
  });

const switchWorkspace = protectedProcedure
  .input(
    z.object({
      workspaceId: z.string().nullable(),
    }),
  )
  .handler(async ({ input, context }) => {
    await setActiveWorkspace(context.user.id, input.workspaceId);
    return { success: true };
  });

const attachPlan = protectedProcedure
  .input(
    z.object({
      ownerType: z.enum(["user", "workspace"]),
      workspaceId: z.string().optional(),
      planId: z.enum(["free", "pro", "business", "enterprise"]),
      successUrl: z.string().url().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const owner = await resolveRequestedOwner({
      userId: context.user.id,
      db: context.db,
      ownerType: "workspace",
      workspaceId: input.workspaceId,
    });
    const plan = BILLING_PLANS[input.planId];
    if (plan.ownerType !== owner.ownerType) {
      throw new ORPCError("BAD_REQUEST", { message: "Plan does not match billing owner type" });
    }

    const result = await attachPlanToOwner({
      owner,
      planId: input.planId,
      successUrl: input.successUrl,
      customerData: {
        name: context.user.name,
        email: context.user.email,
      },
    });

    return {
      checkoutUrl: result?.checkout_url ?? null,
      customerId: result?.customer_id ?? owner.autumnCustomerId,
      planId: input.planId,
    };
  });

const openPortal = protectedProcedure
  .input(
    z.object({
      ownerType: z.enum(["user", "workspace"]),
      workspaceId: z.string().optional(),
      returnUrl: z.string().url().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const owner = await resolveRequestedOwner({
      userId: context.user.id,
      db: context.db,
      ownerType: "workspace",
      workspaceId: input.workspaceId,
    });
    const result = await openBillingPortalForOwner(owner, input.returnUrl);
    return { url: result.url };
  });

const cancelPlan = protectedProcedure
  .input(
    z.object({
      ownerType: z.enum(["user", "workspace"]),
      workspaceId: z.string().optional(),
      productId: z.enum(["pro", "business", "enterprise"]),
    }),
  )
  .handler(async ({ input, context }) => {
    const owner = await resolveRequestedOwner({
      userId: context.user.id,
      db: context.db,
      ownerType: "workspace",
      workspaceId: input.workspaceId,
    });
    const membership = await getWorkspaceMembershipForUser(context.user.id, owner.ownerId);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new ORPCError("FORBIDDEN", { message: "Workspace admin required" });
    }
    await cancelPlanForOwner(owner, input.productId);
    return { success: true };
  });

const manualTopUp = protectedProcedure
  .input(
    z.object({
      ownerType: z.enum(["user", "workspace"]),
      workspaceId: z.string().optional(),
      usdAmount: z.number().positive(),
    }),
  )
  .handler(async ({ input, context }) => {
    const role = await getDbRole(context.user.id, context.db);
    if (role !== "admin") {
      throw new ORPCError("FORBIDDEN", { message: "Admin role required for manual top-ups" });
    }

    const owner = await resolveRequestedOwner({
      userId: context.user.id,
      db: context.db,
      ownerType: "workspace",
      workspaceId: input.workspaceId,
    });
    const result = await createManualTopUp({
      owner,
      grantedByUserId: context.user.id,
      usdAmount: input.usdAmount,
    });
    return {
      id: result.id,
      creditsGranted: result.creditsGranted,
      expiresAt: result.expiresAt,
    };
  });

const inviteMembers = protectedProcedure
  .input(
    z.object({
      workspaceId: z.string(),
      emails: z.array(z.string().email()).min(1).max(20),
      role: z.enum(["admin", "member"]).default("member"),
    }),
  )
  .handler(async ({ input, context }) => {
    const membership = await getWorkspaceMembershipForUser(context.user.id, input.workspaceId);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new ORPCError("FORBIDDEN", { message: "Workspace admin required" });
    }
    const added = await addWorkspaceMembers(input.workspaceId, input.emails, input.role);
    return { added };
  });

const members = protectedProcedure
  .input(
    z.object({
      workspaceId: z.string(),
    }),
  )
  .handler(async ({ input, context }) => {
    const membership = await getWorkspaceMembershipForUser(context.user.id, input.workspaceId);
    if (!membership) {
      throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
    }

    return {
      members: await listWorkspaceMembers(input.workspaceId),
      membershipRole: membership.role,
    };
  });

const rename = protectedProcedure
  .input(
    z.object({
      workspaceId: z.string(),
      name: z.string().trim().min(2).max(80),
    }),
  )
  .handler(async ({ input, context }) => {
    const membership = await getWorkspaceMembershipForUser(context.user.id, input.workspaceId);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new ORPCError("FORBIDDEN", { message: "Workspace admin required" });
    }

    return renameWorkspace(input.workspaceId, input.name);
  });

export const billingRouter = {
  overview,
  createWorkspace,
  switchWorkspace,
  attachPlan,
  openPortal,
  cancelPlan,
  manualTopUp,
  inviteMembers,
  members,
  rename,
};
