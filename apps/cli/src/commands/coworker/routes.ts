import { buildCommand, buildRouteMap } from "@stricli/core";

const commonServerFlags = {
  server: {
    kind: "parsed" as const,
    parse: (input: string) => input,
    optional: true as const,
    brief: "Server URL",
  },
  json: {
    kind: "boolean" as const,
    optional: true as const,
    brief: "Print JSON output",
  },
};

export const coworkerListCommand = buildCommand({
  loader: async () => import("./list"),
  parameters: {
    flags: commonServerFlags,
    aliases: {
      s: "server",
    },
    positional: {
      kind: "tuple",
      parameters: [],
    },
  },
  docs: {
    brief: "List coworkers",
  },
});

export const coworkerGetCommand = buildCommand({
  loader: async () => import("./get"),
  parameters: {
    flags: commonServerFlags,
    aliases: {
      s: "server",
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Coworker ID or @username",
          parse: (input: string) => input,
          placeholder: "coworker",
        },
      ],
    },
  },
  docs: {
    brief: "Get coworker details",
  },
});

export const coworkerCreateCommand = buildCommand({
  loader: async () => import("./create"),
  parameters: {
    flags: {
      server: commonServerFlags.server,
      name: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Coworker name",
      },
      trigger: {
        kind: "parsed",
        parse: (input: string) => input,
        brief: "Trigger type",
      },
      prompt: {
        kind: "parsed",
        parse: (input: string) => input,
        brief: "Coworker prompt",
      },
      promptDo: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Additional do instructions",
      },
      promptDont: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Additional don't instructions",
      },
      autoApprove: {
        kind: "boolean",
        optional: true as const,
        brief: "Enable auto-approve",
      },
      model: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Model reference",
      },
      authSource: {
        kind: "enum",
        values: ["user", "shared"] as const,
        optional: true,
        brief: "Model auth source",
      },
      integrations: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Comma-separated allowed integrations",
      },
      json: commonServerFlags.json,
    },
    aliases: {
      s: "server",
      n: "name",
      t: "trigger",
      p: "prompt",
      M: "model",
    },
    positional: {
      kind: "tuple",
      parameters: [],
    },
  },
  docs: {
    brief: "Create a coworker",
  },
});

export const coworkerRunCommand = buildCommand({
  loader: async () => import("./run"),
  parameters: {
    flags: {
      server: commonServerFlags.server,
      payload: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "JSON payload passed to the run",
      },
      watch: {
        kind: "boolean",
        optional: true as const,
        brief: "Watch run logs after triggering",
      },
      watchInterval: {
        kind: "parsed",
        parse: (input: string) => Number(input),
        optional: true,
        brief: "Watch interval in seconds",
      },
      json: commonServerFlags.json,
    },
    aliases: {
      s: "server",
      P: "payload",
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Coworker ID or @username",
          parse: (input: string) => input,
          placeholder: "coworker",
        },
      ],
    },
  },
  docs: {
    brief: "Trigger a coworker run",
  },
});

export const coworkerLogsCommand = buildCommand({
  loader: async () => import("./logs"),
  parameters: {
    flags: {
      server: commonServerFlags.server,
      watch: {
        kind: "boolean",
        optional: true as const,
        brief: "Watch for new run events",
      },
      watchInterval: {
        kind: "parsed",
        parse: (input: string) => Number(input),
        optional: true,
        brief: "Watch interval in seconds",
      },
      json: commonServerFlags.json,
    },
    aliases: {
      s: "server",
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Run ID",
          parse: (input: string) => input,
          placeholder: "run-id",
        },
      ],
    },
  },
  docs: {
    brief: "Show coworker run logs",
  },
});

export const coworkerApproveCommand = buildCommand({
  loader: async () => import("./approve"),
  parameters: {
    flags: {
      server: commonServerFlags.server,
    },
    aliases: {
      s: "server",
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Run ID",
          parse: (input: string) => input,
          placeholder: "run-id",
        },
        {
          brief: "Tool use ID",
          parse: (input: string) => input,
          placeholder: "tool-use-id",
        },
        {
          brief: "Decision",
          parse: (input: string) => input as "approve" | "deny",
          placeholder: "decision",
        },
      ],
    },
  },
  docs: {
    brief: "Approve or deny a pending coworker tool use",
  },
});

export const coworkerRoutes = buildRouteMap({
  routes: {
    list: coworkerListCommand,
    get: coworkerGetCommand,
    create: coworkerCreateCommand,
    run: coworkerRunCommand,
    logs: coworkerLogsCommand,
    approve: coworkerApproveCommand,
  },
  docs: {
    brief: "Coworker commands",
  },
});
