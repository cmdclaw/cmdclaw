import { buildApplication, buildRouteMap } from "@stricli/core";
import { authRoutes } from "./commands/auth/routes";
import { chatCommand } from "./commands/chat/command";
import { coworkerRoutes } from "./commands/coworker/routes";

const routes = buildRouteMap({
  routes: {
    chat: chatCommand,
    auth: authRoutes,
    coworker: coworkerRoutes,
  },
  docs: {
    brief: "CmdClaw CLI",
  },
});

export const app = buildApplication(routes, {
  name: "cmdclaw",
  versionInfo: {
    currentVersion: "0.1.0",
  },
});
