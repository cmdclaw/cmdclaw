import { z } from "zod";
import {
  deleteWebPushSubscription,
  getWebPushPublicKey,
  saveWebPushSubscription,
} from "@/server/services/web-push-service";
import { protectedProcedure } from "../middleware";

const pushSubscriptionInputSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.union([z.number().int(), z.null()]),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
});

const getPushConfig = protectedProcedure.handler(async () => ({
  supported: getWebPushPublicKey() !== null,
  publicKey: getWebPushPublicKey(),
}));

const savePushSubscription = protectedProcedure
  .input(pushSubscriptionInputSchema)
  .handler(async ({ input, context }) => {
    await saveWebPushSubscription({
      userId: context.user.id,
      endpoint: input.endpoint,
      expirationTime:
        typeof input.expirationTime === "number" ? new Date(input.expirationTime) : null,
      auth: input.keys.auth,
      p256dh: input.keys.p256dh,
      userAgent: context.session.userAgent ?? null,
    });

    return { success: true };
  });

const deletePushSubscription = protectedProcedure
  .input(
    z.object({
      endpoint: z.url(),
    }),
  )
  .handler(async ({ input, context }) => {
    await deleteWebPushSubscription({
      userId: context.user.id,
      endpoint: input.endpoint,
    });

    return { success: true };
  });

export const notificationRouter = {
  getPushConfig,
  savePushSubscription,
  deletePushSubscription,
};
