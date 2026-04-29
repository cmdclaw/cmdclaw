import { user } from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { AuthenticatedContext } from "./middleware";

type SessionWithImpersonation = {
  impersonatedBy?: string | null;
};

function readImpersonatedBy(session: AuthenticatedContext["session"]): string | null {
  const impersonatedBy = (session as AuthenticatedContext["session"] & SessionWithImpersonation)
    .impersonatedBy;
  return typeof impersonatedBy === "string" && impersonatedBy.trim().length > 0
    ? impersonatedBy
    : null;
}

async function getUserRole(
  context: Pick<AuthenticatedContext, "db">,
  userId: string,
): Promise<string | null> {
  const dbUser = await context.db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: {
      role: true,
    },
  });
  return dbUser?.role ?? null;
}

export async function requireAppAdminActor(
  context: Pick<AuthenticatedContext, "db" | "session" | "user">,
) {
  if ((await getUserRole(context, context.user.id)) === "admin") {
    return { id: context.user.id };
  }

  const impersonatedBy = readImpersonatedBy(context.session);
  if (impersonatedBy && (await getUserRole(context, impersonatedBy)) === "admin") {
    return { id: impersonatedBy };
  }

  throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
}
