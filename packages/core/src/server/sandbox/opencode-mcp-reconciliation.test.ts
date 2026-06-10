import { describe, expect, it, vi } from "vitest";
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { RuntimeMcpServer } from "./core/types";
import {
  computeOpencodeMcpServersHash,
  reconcileOpencodeMcpServers,
  toOpencodeMcpConfig,
} from "./opencode-mcp-reconciliation";

const linearServer: RuntimeMcpServer = {
  type: "http",
  name: "linear-mcp",
  url: "https://mcp.linear.app/mcp",
  headers: [{ name: "Authorization", value: "Bearer token" }],
};

function createClient(options: {
  status: Record<string, { status: string; error?: string }>;
  addResults?: Record<string, { status: string; error?: string }>;
  addError?: unknown;
}) {
  const status = vi.fn(async () => ({ data: options.status, error: undefined }));
  const disconnect = vi.fn(async () => ({ data: {}, error: undefined }));
  const add = vi.fn(async (params: { name?: string }) => {
    if (options.addError) {
      return { data: undefined, error: options.addError };
    }
    const name = params.name ?? "";
    return {
      data: { [name]: options.addResults?.[name] ?? { status: "connected" } },
      error: undefined,
    };
  });
  return {
    client: {
      mcp: { status, disconnect, add },
    } as unknown as OpencodeClient,
    status,
    disconnect,
    add,
  };
}

describe("OpenCode MCP reconciliation", () => {
  it("maps runtime servers to OpenCode MCP configs", () => {
    expect(toOpencodeMcpConfig(linearServer)).toEqual({
      type: "remote",
      url: "https://mcp.linear.app/mcp",
      headers: { Authorization: "Bearer token" },
      oauth: false,
      enabled: true,
    });

    expect(
      toOpencodeMcpConfig({
        type: "stdio",
        name: "local-mcp",
        command: "bunx",
        args: ["some-mcp"],
        env: [{ name: "TOKEN", value: "t" }],
      }),
    ).toEqual({
      type: "local",
      command: ["bunx", "some-mcp"],
      environment: { TOKEN: "t" },
      enabled: true,
    });
  });

  it("disconnects stale connected servers and adds desired servers dynamically", async () => {
    const { client, disconnect, add } = createClient({
      status: {
        stale: { status: "connected" },
      },
    });

    const warnings = await reconcileOpencodeMcpServers({
      client,
      servers: [linearServer],
    });

    expect(disconnect).toHaveBeenCalledWith({
      name: "stale",
      directory: "/app",
    });
    expect(add).toHaveBeenCalledWith({
      directory: "/app",
      name: "linear-mcp",
      config: toOpencodeMcpConfig(linearServer),
    });
    expect(warnings).toEqual([]);
  });

  it("warns for desired servers that fail to connect", async () => {
    const { client } = createClient({
      status: {},
      addResults: {
        "linear-mcp": { status: "failed", error: "bad token" },
      },
    });

    const warnings = await reconcileOpencodeMcpServers({
      client,
      servers: [linearServer],
    });

    expect(warnings).toEqual([
      {
        serverName: "linear-mcp",
        message: "OpenCode MCP server linear-mcp is not connected (status=failed): bad token.",
      },
    ]);
  });

  it("warns when adding a server errors", async () => {
    const { client } = createClient({
      status: {},
      addError: { message: "boom" },
    });

    const warnings = await reconcileOpencodeMcpServers({
      client,
      servers: [linearServer],
    });

    expect(warnings).toEqual([
      {
        serverName: "linear-mcp",
        message: 'Failed to add OpenCode MCP server linear-mcp: {"message":"boom"}',
      },
    ]);
  });

  it("skips adds entirely when no servers are desired", async () => {
    const { client, add } = createClient({ status: {} });

    const warnings = await reconcileOpencodeMcpServers({
      client,
      servers: [],
    });

    expect(add).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
  });

  it("skips re-adding connected servers when the applied config hash is unchanged", async () => {
    const { client, add } = createClient({
      status: { "linear-mcp": { status: "connected" } },
    });
    const hash = computeOpencodeMcpServersHash([linearServer]);
    const store = {
      read: vi.fn(async () => hash),
      write: vi.fn(async () => {}),
    };

    const warnings = await reconcileOpencodeMcpServers({
      client,
      servers: [linearServer],
      appliedConfigStore: store,
    });

    expect(add).not.toHaveBeenCalled();
    expect(store.write).toHaveBeenCalledWith(hash);
    expect(warnings).toEqual([]);
  });

  it("re-adds connected servers when the desired config hash changed", async () => {
    const { client, add } = createClient({
      status: { "linear-mcp": { status: "connected" } },
    });
    const store = {
      read: vi.fn(async () => "stale-hash"),
      write: vi.fn(async () => {}),
    };

    await reconcileOpencodeMcpServers({
      client,
      servers: [linearServer],
      appliedConfigStore: store,
    });

    expect(add).toHaveBeenCalledWith({
      directory: "/app",
      name: "linear-mcp",
      config: toOpencodeMcpConfig(linearServer),
    });
    expect(store.write).toHaveBeenCalledWith(computeOpencodeMcpServersHash([linearServer]));
  });

  it("re-adds servers that are not connected even when the hash matches (restart recovery)", async () => {
    const { client, add } = createClient({ status: {} });
    const hash = computeOpencodeMcpServersHash([linearServer]);
    const store = {
      read: vi.fn(async () => hash),
      write: vi.fn(async () => {}),
    };

    await reconcileOpencodeMcpServers({
      client,
      servers: [linearServer],
      appliedConfigStore: store,
    });

    expect(add).toHaveBeenCalledWith({
      directory: "/app",
      name: "linear-mcp",
      config: toOpencodeMcpConfig(linearServer),
    });
  });
});
