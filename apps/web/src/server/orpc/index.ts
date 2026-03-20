import { baseProcedure } from "./middleware";
import { adminSharedProviderAuthRouter } from "./routers/admin-shared-provider-auth";
import { billingRouter } from "./routers/billing";
import { conversationRouter } from "./routers/conversation";
import { coworkerRouter } from "./routers/coworker";
import { generationRouter } from "./routers/generation";
import { integrationRouter } from "./routers/integration";
import { integrationSkillRouter } from "./routers/integration-skill";
import { notificationRouter } from "./routers/notification";
import { providerAuthRouter } from "./routers/provider-auth";
import { skillRouter } from "./routers/skill";
import { userRouter } from "./routers/user";
import { voiceRouter } from "./routers/voice";

const ping = baseProcedure.handler(async () => ({
  status: "ok" as const,
  timestamp: new Date().toISOString(),
}));

export const appRouter = {
  adminSharedProviderAuth: adminSharedProviderAuthRouter,
  billing: billingRouter,
  conversation: conversationRouter,
  generation: generationRouter,
  integration: integrationRouter,
  integrationSkill: integrationSkillRouter,
  notification: notificationRouter,
  providerAuth: providerAuthRouter,
  skill: skillRouter,
  user: userRouter,
  voice: voiceRouter,
  coworker: coworkerRouter,
  health: { ping },
};

export type AppRouter = typeof appRouter;
