import { buildCommand } from "@stricli/core";

export const chatCommand = buildCommand({
  loader: async () => import("./impl"),
  parameters: {
    flags: {
      server: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Server URL",
      },
      conversation: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Continue an existing conversation",
      },
      message: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Send an initial message",
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
      sandbox: {
        kind: "enum",
        values: ["e2b", "daytona", "docker"] as const,
        optional: true,
        brief: "Sandbox provider",
      },
      listModels: {
        kind: "boolean",
        optional: true,
        brief: "List model options and exit",
      },
      autoApprove: {
        kind: "boolean",
        optional: true,
        brief: "Auto-approve tool calls",
      },
      validate: {
        kind: "boolean",
        default: true,
        brief: "Validate persisted assistant messages",
      },
      questionAnswer: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        variadic: true,
        brief: "Pre-answer question prompts",
      },
      file: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        variadic: true,
        brief: "Attach a file to the message",
      },
      chromeTrace: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        brief: "Write Chrome trace JSON to path",
      },
      token: {
        kind: "parsed",
        parse: (input: string) => input,
        optional: true,
        hidden: true,
        brief: "Use a provided token directly",
      },
    },
    aliases: {
      s: "server",
      c: "conversation",
      m: "message",
      M: "model",
      f: "file",
      q: "questionAnswer",
    },
    positional: {
      kind: "tuple",
      parameters: [],
    },
  },
  docs: {
    brief: "Chat with CmdClaw",
  },
});
