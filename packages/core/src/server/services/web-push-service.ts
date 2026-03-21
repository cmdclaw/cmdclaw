import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { env } from "../../env";
import { db } from "@cmdclaw/db/client";
import { user, webPushSubscription } from "@cmdclaw/db/schema";

type StoredPushSubscription = {
  endpoint: string;
  expirationTime: Date | null;
  auth: string;
  p256dh: string;
};

type TaskDonePushInput = {
  userId: string;
  conversationId: string;
  messageId: string;
  content?: string;
};

let vapidConfigured = false;

function hasWebPushConfig(): boolean {
  return Boolean(
    env.WEB_PUSH_VAPID_SUBJECT?.trim() &&
    env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() &&
    env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim(),
  );
}

function ensureWebPushConfigured(): boolean {
  if (!hasWebPushConfig()) {
    return false;
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(
      env.WEB_PUSH_VAPID_SUBJECT!.trim(),
      env.WEB_PUSH_VAPID_PUBLIC_KEY!.trim(),
      env.WEB_PUSH_VAPID_PRIVATE_KEY!.trim(),
    );
    vapidConfigured = true;
  }

  return true;
}

export function getWebPushPublicKey(): string | null {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  return publicKey ? publicKey : null;
}

export function buildTaskDonePushBody(content?: string): string {
  const normalized = content?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Your task is complete.";
  }

  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function toWebPushSubscriptionRecord(subscription: StoredPushSubscription) {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime?.getTime() ?? null,
    keys: {
      auth: subscription.auth,
      p256dh: subscription.p256dh,
    },
  };
}

async function removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db.delete(webPushSubscription).where(eq(webPushSubscription.endpoint, endpoint));
}

export async function sendTaskDonePush({
  userId,
  conversationId,
  messageId,
  content,
}: TaskDonePushInput): Promise<void> {
  if (!ensureWebPushConfigured()) {
    return;
  }

  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: {
      taskDonePushEnabled: true,
    },
  });

  if (!dbUser?.taskDonePushEnabled) {
    return;
  }

  const subscriptions = await db.query.webPushSubscription.findMany({
    where: eq(webPushSubscription.userId, userId),
    columns: {
      endpoint: true,
      expirationTime: true,
      auth: true,
      p256dh: true,
    },
  });

  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title: "CmdClaw task done",
    body: buildTaskDonePushBody(content),
    tag: `cmdclaw-task-done-${conversationId}`,
    url: `/chat/${conversationId}?message=${messageId}`,
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(toWebPushSubscriptionRecord(subscription), payload);
      } catch (error) {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof error.statusCode === "number"
            ? error.statusCode
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
          await removeSubscriptionByEndpoint(subscription.endpoint);
          return;
        }

        console.error("[WebPush] Failed to send task completion push", {
          userId,
          conversationId,
          endpoint: subscription.endpoint,
          error,
        });
      }
    }),
  );
}

export async function saveWebPushSubscription(input: {
  userId: string;
  endpoint: string;
  expirationTime: Date | null;
  auth: string;
  p256dh: string;
  userAgent?: string | null;
}): Promise<void> {
  await db
    .insert(webPushSubscription)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      expirationTime: input.expirationTime,
      auth: input.auth,
      p256dh: input.p256dh,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: webPushSubscription.endpoint,
      set: {
        userId: input.userId,
        expirationTime: input.expirationTime,
        auth: input.auth,
        p256dh: input.p256dh,
        userAgent: input.userAgent ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function deleteWebPushSubscription(input: {
  userId: string;
  endpoint: string;
}): Promise<void> {
  await db
    .delete(webPushSubscription)
    .where(
      and(
        eq(webPushSubscription.userId, input.userId),
        eq(webPushSubscription.endpoint, input.endpoint),
      ),
    );
}
