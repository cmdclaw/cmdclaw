import {
  getWorkspaceMembershipForUser,
  requireActiveWorkspaceForUser,
} from "@cmdclaw/core/server/billing/service";
import { ORPCError } from "@orpc/server";

export function isWorkspaceAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export async function requireActiveWorkspaceAccess(userId: string) {
  const workspace = await requireActiveWorkspaceForUser(userId);
  const membership = await getWorkspaceMembershipForUser(userId, workspace.id);

  if (!membership) {
    throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
  }

  return {
    workspace,
    membership,
  };
}

export async function requireActiveWorkspaceAdmin(userId: string) {
  const access = await requireActiveWorkspaceAccess(userId);
  if (!isWorkspaceAdminRole(access.membership.role)) {
    throw new ORPCError("FORBIDDEN", { message: "Workspace admin role required" });
  }
  return access;
}
