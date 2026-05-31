import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { RuntimeMcpServer } from "./core/types";

export const OPENCODE_WORKSPACE_DIRECTORY = "/app";
export const OPENCODE_CONFIG_PATH = "/app/opencode.json";

export type OpenCodeMcpRuntimeWarning = {
  serverName: string;
  message: string;
};

type SandboxFileAccess = {
  files: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string | ArrayBuffer) => Promise<void>;
  };
};

function toOpencodeMcpConfig(server: RuntimeMcpServer) {
  if (server.type === "stdio") {
    return {
      type: "local" as const,
      command: [server.command, ...server.args],
      environment: Object.fromEntries(server.env.map((entry) => [entry.name, entry.value])),
      enabled: true,
    };
  }

  return {
    type: "remote" as const,
    url: server.url,
    headers: Object.fromEntries(server.headers.map((entry) => [entry.name, entry.value])),
    oauth: server.headers.length > 0 ? (false as const) : undefined,
    enabled: true,
  };
}

export function buildOpencodeConfigWithMcp(
  currentRaw: string,
  servers: RuntimeMcpServer[] | undefined,
): string {
  let current: Record<string, unknown>;
  try {
    const parsed = JSON.parse(currentRaw) as unknown;
    current =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    current = {};
  }

  const previousMcp =
    current.mcp && typeof current.mcp === "object" && !Array.isArray(current.mcp)
      ? (current.mcp as Record<string, unknown>)
      : {};
  const tools =
    current.tools && typeof current.tools === "object" && !Array.isArray(current.tools)
      ? { ...(current.tools as Record<string, unknown>) }
      : {};

  for (const serverName of Object.keys(previousMcp)) {
    delete tools[`${serverName}_*`];
  }

  const mcp = Object.fromEntries(
    (servers ?? []).map((server) => [server.name, toOpencodeMcpConfig(server)]),
  );
  for (const serverName of Object.keys(mcp)) {
    tools[`${serverName}_*`] = true;
  }

  const next: Record<string, unknown> = {
    ...current,
    tools,
    mcp,
  };

  if (Object.keys(mcp).length === 0) {
    delete next.mcp;
  }

  return `${JSON.stringify(next, null, 2)}\n`;
}

export async function writeOpencodeMcpConfigToSandbox(
  sandbox: SandboxFileAccess,
  servers: RuntimeMcpServer[] | undefined,
): Promise<boolean> {
  const currentRaw = await sandbox.files.read(OPENCODE_CONFIG_PATH).catch(() => "{}");
  const nextRaw = buildOpencodeConfigWithMcp(currentRaw, servers);
  if (currentRaw === nextRaw) {
    return false;
  }
  await sandbox.files.write(OPENCODE_CONFIG_PATH, nextRaw);
  return true;
}

function formatMcpError(error: unknown): string {
  if (!error) {
    return "unknown error";
  }
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function reconcileOpencodeMcpServers(input: {
  client: OpencodeClient;
  servers: RuntimeMcpServer[] | undefined;
}): Promise<OpenCodeMcpRuntimeWarning[]> {
  const warnings: OpenCodeMcpRuntimeWarning[] = [];
  const servers = input.servers ?? [];
  const desiredNames = new Set(servers.map((server) => server.name));
  const statusResult = await input.client.mcp.status({ directory: OPENCODE_WORKSPACE_DIRECTORY });

  if (statusResult.error) {
    warnings.push({
      serverName: "mcp",
      message: `Failed to read OpenCode MCP status before reconciliation: ${formatMcpError(statusResult.error)}`,
    });
  } else {
    for (const [name, status] of Object.entries(statusResult.data ?? {})) {
      if (desiredNames.has(name)) {
        continue;
      }
      if ((status as { status?: string }).status !== "connected") {
        continue;
      }
      const disconnectResult = await input.client.mcp.disconnect({
        name,
        directory: OPENCODE_WORKSPACE_DIRECTORY,
      });
      if (disconnectResult.error) {
        warnings.push({
          serverName: name,
          message: `Failed to disconnect stale OpenCode MCP server ${name}: ${formatMcpError(disconnectResult.error)}`,
        });
      }
    }
  }

  const nextStatusResult = await input.client.mcp.status({
    directory: OPENCODE_WORKSPACE_DIRECTORY,
  });
  if (nextStatusResult.error) {
    warnings.push({
      serverName: "mcp",
      message: `Failed to read OpenCode MCP status after reconciliation: ${formatMcpError(nextStatusResult.error)}`,
    });
    return warnings;
  }

  for (const server of servers) {
    const currentStatus = nextStatusResult.data?.[server.name];
    if (currentStatus?.status === "connected") {
      continue;
    }

    const status = currentStatus?.status ?? "missing";
    const suffix =
      currentStatus && "error" in currentStatus ? `: ${String(currentStatus.error)}` : "";
    warnings.push({
      serverName: server.name,
      message: `OpenCode MCP server ${server.name} is not connected (status=${status})${suffix}.`,
    });
  }

  return warnings;
}
