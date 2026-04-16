import type { Session, User } from "better-auth";
import { verifyHostedMcpAccessToken } from "@cmdclaw/core/server/hosted-mcp-oauth";
import { db } from "@cmdclaw/db/client";
import { user as userTable } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export type HostedMcpContext = {
  token: string;
  userId: string;
  workspaceId: string;
  audience: "gmail" | "internal";
  scopes: string[];
  clientId: string;
  grantId: string;
  expiresAt: number;
};

export type ORPCContext = {
  headers: Headers;
  db: typeof db;
  session: Session | null;
  user: User | null;
  authSource: "anonymous" | "session" | "hosted_mcp";
  hostedMcp: HostedMcpContext | null;
  workspaceId: string | null;
};

async function resolveHostedMcpContext(headers: Headers): Promise<{
  user: User;
  session: Session;
  hostedMcp: HostedMcpContext;
} | null> {
  const authorization = headers.get("authorization");
  const token =
    typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : null;

  if (!token) {
    return null;
  }

  try {
    const claims = await verifyHostedMcpAccessToken(token, {
      secret: process.env.CMDCLAW_SERVER_SECRET ?? "",
    });
    const dbUser = await db.query.user.findFirst({
      where: eq(userTable.id, claims.userId),
    });
    if (!dbUser) {
      return null;
    }

    return {
      user: dbUser as unknown as User,
      session: {
        id: `hosted-mcp:${claims.grantId}`,
        userId: claims.userId,
        token: `hosted-mcp:${claims.grantId}`,
        expiresAt: new Date(claims.exp * 1000),
        createdAt: new Date(claims.iat * 1000),
        updatedAt: new Date(claims.iat * 1000),
        ipAddress: null,
        userAgent: headers.get("user-agent"),
      } as Session,
      hostedMcp: {
        token,
        userId: claims.userId,
        workspaceId: claims.workspaceId,
        audience: claims.audience,
        scopes: claims.scope,
        clientId: claims.clientId,
        grantId: claims.grantId,
        expiresAt: claims.exp,
      },
    };
  } catch {
    return null;
  }
}

export async function createORPCContext(opts: { headers: Headers }): Promise<ORPCContext> {
  // Get session from Better-Auth
  const sessionData = await auth.api.getSession({
    headers: opts.headers,
  });

  if (sessionData?.session && sessionData.user) {
    return {
      headers: opts.headers,
      db,
      session: sessionData.session,
      user: sessionData.user,
      authSource: "session",
      hostedMcp: null,
      workspaceId: null,
    };
  }

  const hostedMcpAuth = await resolveHostedMcpContext(opts.headers);

  return {
    headers: opts.headers,
    db,
    session: hostedMcpAuth?.session ?? null,
    user: hostedMcpAuth?.user ?? null,
    authSource: hostedMcpAuth ? "hosted_mcp" : "anonymous",
    hostedMcp: hostedMcpAuth?.hostedMcp ?? null,
    workspaceId: hostedMcpAuth?.hostedMcp.workspaceId ?? null,
  };
}
