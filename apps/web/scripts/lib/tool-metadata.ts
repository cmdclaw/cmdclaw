import { parseBashCommand } from "@cmdclaw/core/server/ai/permission-checker";

export function resolveCliToolMetadata(toolUse: {
  toolName: string;
  toolInput: unknown;
  integration?: string;
  isWrite?: boolean;
}): {
  integration?: string;
  isWrite?: boolean;
} {
  if (toolUse.integration !== undefined || toolUse.isWrite !== undefined) {
    return {
      integration: toolUse.integration,
      isWrite: toolUse.isWrite,
    };
  }

  if (toolUse.toolName.toLowerCase() !== "bash") {
    return {};
  }

  if (typeof toolUse.toolInput !== "object" || toolUse.toolInput === null) {
    return {};
  }

  const command = (toolUse.toolInput as { command?: unknown }).command;
  if (typeof command !== "string" || command.trim().length === 0) {
    return {};
  }

  const parsed = parseBashCommand(command);
  if (!parsed) {
    return {};
  }

  return {
    integration: parsed.integration,
    isWrite: parsed.isWrite,
  };
}
