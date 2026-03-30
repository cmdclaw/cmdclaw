import { buildCommand, buildRouteMap } from "@stricli/core";

export const authLoginCommand = buildCommand({
  loader: async () => import("./login"),
  parameters: {
    flags: {
      server: {
        kind: "parsed",
        parse: (input) => input,
        optional: true,
        brief: "Server URL",
      },
      token: {
        kind: "parsed",
        parse: (input) => input,
        optional: true,
        brief: "Persist a provided auth token directly",
      },
    },
    aliases: {
      s: "server",
    },
    positional: {
      kind: "tuple",
      parameters: [],
    },
  },
  docs: {
    brief: "Authenticate the CLI",
  },
});

export const authStatusCommand = buildCommand({
  loader: async () => import("./status"),
  parameters: {
    flags: {
      server: {
        kind: "parsed",
        parse: (input) => input,
        optional: true,
        brief: "Server URL",
      },
    },
    aliases: {
      s: "server",
    },
    positional: {
      kind: "tuple",
      parameters: [],
    },
  },
  docs: {
    brief: "Show current auth state",
  },
});

export const authLogoutCommand = buildCommand({
  loader: async () => import("./logout"),
  parameters: {
    flags: {
      server: {
        kind: "parsed",
        parse: (input) => input,
        optional: true,
        brief: "Server URL",
      },
    },
    aliases: {
      s: "server",
    },
    positional: {
      kind: "tuple",
      parameters: [],
    },
  },
  docs: {
    brief: "Clear the saved auth token for a server",
  },
});

export const authRoutes = buildRouteMap({
  routes: {
    login: authLoginCommand,
    status: authStatusCommand,
    logout: authLogoutCommand,
  },
  docs: {
    brief: "Authentication commands",
  },
});
