import { createHash } from "node:crypto";
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { McpLocalConfig, McpRemoteConfig } from "@opencode-ai/sdk/v2/client";
import type { RuntimeMcpServer } from "./core/types";

export const OPENCODE_WORKSPACE_DIRECTORY = "/app";

export type OpenCodeMcpRuntimeWarning = {
  serverName: string;
  message: string;
};

export type OpenCodeMcpAppliedConfigStore = {
  read: () => Promise<string | null>;
  write: (hash: string) => Promise<void>;
};

const MCP_ADD_TIMEOUT_MS = 10_000;

export function computeOpencodeMcpServersHash(servers: RuntimeMcpServer[]): string {
  const canonical = [...servers]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((server) => ({ name: server.name, config: toOpencodeMcpConfig(server) }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function toOpencodeMcpConfig(server: RuntimeMcpServer): McpLocalConfig | McpRemoteConfig {
  if (server.type === "stdio") {
    return {
      type: "local",
      command: [server.command, ...server.args],
      environment: Object.fromEntries(server.env.map((entry) => [entry.name, entry.value])),
      enabled: true,
    };
  }

  return {
    type: "remote",
    url: server.url,
    headers: Object.fromEntries(server.headers.map((entry) => [entry.name, entry.value])),
    oauth: server.headers.length > 0 ? false : undefined,
    enabled: true,
  };
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

/**
 * Reconcile the OpenCode MCP server set dynamically through the runtime API.
 *
 * Stale connected servers are disconnected, and every desired server is
 * (re)added via `mcp.add`, which upserts its config and connects it without
 * restarting the OpenCode server. Adds run in parallel and are bounded by
 * MCP_ADD_TIMEOUT_MS so a single unreachable server cannot stall session init.
 */
export async function reconcileOpencodeMcpServers(input: {
  client: OpencodeClient;
  servers: RuntimeMcpServer[] | undefined;
  appliedConfigStore?: OpenCodeMcpAppliedConfigStore;
}): Promise<OpenCodeMcpRuntimeWarning[]> {
  const warnings: OpenCodeMcpRuntimeWarning[] = [];
  const servers = input.servers ?? [];
  const desiredNames = new Set(servers.map((server) => server.name));
  const statusResult = await input.client.mcp.status({ directory: OPENCODE_WORKSPACE_DIRECTORY });
  const currentStatus: Record<string, { status?: string }> = statusResult.error
    ? {}
    : ((statusResult.data ?? {}) as Record<string, { status?: string }>);

  if (statusResult.error) {
    warnings.push({
      serverName: "mcp",
      message: `Failed to read OpenCode MCP status before reconciliation: ${formatMcpError(statusResult.error)}`,
    });
  } else {
    for (const [name, status] of Object.entries(currentStatus)) {
      if (desiredNames.has(name)) {
        continue;
      }
      if (status.status !== "connected") {
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

  if (servers.length === 0) {
    return warnings;
  }

  // Reused runtimes: when the desired config is byte-identical to what was
  // last applied to this sandbox (hash match) and a server is still connected,
  // re-adding it would only churn the live connection. Credential rotation
  // changes the hash, and an OpenCode restart drops connected status, so both
  // still trigger a fresh add.
  const desiredHash = computeOpencodeMcpServersHash(servers);
  const lastAppliedHash = statusResult.error
    ? null
    : ((await input.appliedConfigStore?.read().catch(() => null)) ?? null);
  const serversToAdd = servers.filter(
    (server) =>
      lastAppliedHash !== desiredHash || currentStatus[server.name]?.status !== "connected",
  );

  const addWarnings = await Promise.all(
    serversToAdd.map(async (server): Promise<OpenCodeMcpRuntimeWarning | null> => {
      const addPromise = (async (): Promise<OpenCodeMcpRuntimeWarning | null> => {
        const result = await input.client.mcp.add({
          directory: OPENCODE_WORKSPACE_DIRECTORY,
          name: server.name,
          config: toOpencodeMcpConfig(server),
        });
        if (result.error) {
          return {
            serverName: server.name,
            message: `Failed to add OpenCode MCP server ${server.name}: ${formatMcpError(result.error)}`,
          };
        }
        const status = result.data?.[server.name] as
          | { status?: string; error?: unknown }
          | undefined;
        if (status?.status !== "connected") {
          const suffix =
            status && "error" in status && status.error ? `: ${String(status.error)}` : "";
          return {
            serverName: server.name,
            message: `OpenCode MCP server ${server.name} is not connected (status=${status?.status ?? "missing"})${suffix}.`,
          };
        }
        return null;
      })().catch((error) => ({
        serverName: server.name,
        message: `Failed to add OpenCode MCP server ${server.name}: ${formatMcpError(error)}`,
      }));

      // Bound the wait so one unreachable server cannot stall session init.
      // A timed-out add keeps running inside OpenCode; its late result is
      // intentionally dropped here and only the timeout warning is reported.
      return await Promise.race([
        addPromise,
        new Promise<OpenCodeMcpRuntimeWarning>((resolve) =>
          setTimeout(
            () =>
              resolve({
                serverName: server.name,
                message: `OpenCode MCP server ${server.name} did not finish connecting within ${MCP_ADD_TIMEOUT_MS}ms; continuing without it.`,
              }),
            MCP_ADD_TIMEOUT_MS,
          ),
        ),
      ]);
    }),
  );
  warnings.push(...addWarnings.filter((warning) => warning !== null));

  await input.appliedConfigStore?.write(desiredHash).catch(() => {});

  return warnings;
}
