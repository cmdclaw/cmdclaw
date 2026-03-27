import type { CloudAuthExchangePayload } from "@cmdclaw/core/server/control-plane/types";
import { ensureWorkspaceForUser } from "@cmdclaw/core/server/billing/service";
import { upsertCloudAccountLinkForUser } from "@cmdclaw/core/server/control-plane/local-links";
import { db } from "@cmdclaw/db/client";
import { cloudAccountLink, session, user } from "@cmdclaw/db/schema";
import { serializeSignedCookie } from "better-call";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { env } from "@/env";
import { INVITE_ONLY_LOGIN_ERROR, shouldGrantAdminRole } from "@/lib/admin-emails";
import { isApprovedLoginEmail } from "@/server/lib/approved-login-emails";

function getDefaultName(email: string, fallbackName: string | null) {
  if (fallbackName?.trim()) {
    return fallbackName.trim();
  }

  const [localPart] = email.split("@");
  return localPart?.trim() || "CmdClaw User";
}

function getSessionCookieName(requestUrl: string) {
  const appUrl = env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? requestUrl;
  return new URL(appUrl).protocol === "https:"
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
}

async function assertInviteOnlyLogin(email: string) {
  if (await isApprovedLoginEmail(email)) {
    return;
  }

  throw new Error(INVITE_ONLY_LOGIN_ERROR);
}

async function createLocalSession(userId: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const token = randomBytes(48).toString("hex");

  await db.insert(session).values({
    id: randomUUID(),
    userId,
    token,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  return { token, expiresAt };
}

export async function resolveOrCreateLocalUserFromCloudIdentity(
  identity: CloudAuthExchangePayload,
): Promise<string> {
  await assertInviteOnlyLogin(identity.email);

  const now = new Date();
  const linkedUser = await db.query.cloudAccountLink.findFirst({
    where: eq(cloudAccountLink.cloudUserId, identity.cloudUserId),
    with: {
      user: {
        columns: {
          id: true,
          role: true,
          activeWorkspaceId: true,
        },
      },
    },
  });

  if (linkedUser?.user) {
    await db
      .update(user)
      .set({
        email: identity.email,
        name: getDefaultName(identity.email, identity.name),
        image: identity.image,
        emailVerified: true,
        onboardedAt: now,
        updatedAt: now,
        ...(shouldGrantAdminRole(identity.email) ? { role: "admin" } : {}),
      })
      .where(eq(user.id, linkedUser.user.id));

    await ensureWorkspaceForUser(linkedUser.user.id, linkedUser.user.activeWorkspaceId);
    return linkedUser.user.id;
  }

  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, identity.email),
    columns: {
      id: true,
      role: true,
      activeWorkspaceId: true,
    },
  });

  if (existingUser) {
    const existingLink = await db.query.cloudAccountLink.findFirst({
      where: eq(cloudAccountLink.userId, existingUser.id),
      columns: {
        cloudUserId: true,
      },
    });

    if (existingLink && existingLink.cloudUserId !== identity.cloudUserId) {
      throw new Error("This self-hosted user is already linked to a different cloud account");
    }

    await db
      .update(user)
      .set({
        email: identity.email,
        name: getDefaultName(identity.email, identity.name),
        image: identity.image,
        emailVerified: true,
        onboardedAt: now,
        updatedAt: now,
        ...(shouldGrantAdminRole(identity.email) ? { role: "admin" } : {}),
      })
      .where(eq(user.id, existingUser.id));

    await upsertCloudAccountLinkForUser(existingUser.id, identity.cloudUserId);
    await ensureWorkspaceForUser(existingUser.id, existingUser.activeWorkspaceId);
    return existingUser.id;
  }

  const userId = randomUUID();
  await db.insert(user).values({
    id: userId,
    email: identity.email,
    name: getDefaultName(identity.email, identity.name),
    image: identity.image,
    emailVerified: true,
    onboardedAt: now,
    role: shouldGrantAdminRole(identity.email) ? "admin" : "user",
    createdAt: now,
    updatedAt: now,
  });

  await upsertCloudAccountLinkForUser(userId, identity.cloudUserId);
  await ensureWorkspaceForUser(userId, null);

  return userId;
}

export async function createLocalSessionRedirectResponse(args: {
  userId: string;
  redirectUrl: URL;
  requestUrl: string;
}) {
  const response = NextResponse.redirect(args.redirectUrl);
  const { token, expiresAt } = await createLocalSession(args.userId);
  const signedToken = (await serializeSignedCookie("", token, env.BETTER_AUTH_SECRET)).replace(
    "=",
    "",
  );

  const cookieName = getSessionCookieName(args.requestUrl);
  response.cookies.set(cookieName, signedToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieName.startsWith("__Secure-"),
    expires: expiresAt,
    path: "/",
  });

  const otherCookieName =
    cookieName === "better-auth.session_token"
      ? "__Secure-better-auth.session_token"
      : "better-auth.session_token";
  response.cookies.delete(otherCookieName);

  return response;
}
