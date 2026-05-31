import { describe, expect, it, vi } from "vitest";
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { RuntimeMcpServer } from "./core/types";
import {
  buildOpencodeConfigWithMcp,
  reconcileOpencodeMcpServers,
  writeOpencodeMcpConfigToSandbox,
} from "./opencode-mcp-reconciliation";

const linearServer: RuntimeMcpServer = {
  type: "remote",
  name: "linear-mcp",
  url: "https://mcp.linear.app/mcp",
  headers: [{ name: "Authorization", value: "Bearer token" }],
};

function createClient(statuses: Array<Record<string, { status: string; error?: string }>>) {
  const status = vi.fn(async () => ({ data: statuses.shift() ?? {}, error: undefined }));
  const disconnect = vi.fn(async () => ({ data: {}, error: undefined }));
  return {
    mcp: {
      status,
      disconnect,
    },
  } as unknown as OpencodeClient & {
    mcp: {
      status: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    };
  };
}

describe("OpenCode MCP reconciliation", () => {
  it("writes allowlisted servers into OpenCode config and removes stale tool globs", () => {
    const next = buildOpencodeConfigWithMcp(
      JSON.stringify({
        tools: {
          "old-mcp_*": true,
          bash: true,
        },
        mcp: {
          "old-mcp": { type: "remote", url: "https://old.example.com" },
        },
      }),
      [linearServer],
    );

    expect(JSON.parse(next)).toEqual({
      tools: {
        bash: true,
        "linear-mcp_*": true,
      },
      mcp: {
        "linear-mcp": {
          type: "remote",
          url: "https://mcp.linear.app/mcp",
          headers: {
            Authorization: "Bearer token",
          },
          oauth: false,
          enabled: true,
        },
      },
    });
  });

  it("does not rewrite unchanged sandbox config", async () => {
    const current = buildOpencodeConfigWithMcp("{}", [linearServer]);
    const sandbox = {
      files: {
        read: vi.fn(async () => current),
        write: vi.fn(async () => {}),
      },
    };

    await expect(writeOpencodeMcpConfigToSandbox(sandbox, [linearServer])).resolves.toBe(false);
    expect(sandbox.files.write).not.toHaveBeenCalled();
  });

  it("disconnects stale connected servers and warns for desired servers that are not connected", async () => {
    const client = createClient([
      {
        stale: { status: "connected" },
        "linear-mcp": { status: "disconnected", error: "bad token" },
      },
      {
        "linear-mcp": { status: "disconnected", error: "bad token" },
      },
    ]);

    const warnings = await reconcileOpencodeMcpServers({
      client,
      servers: [linearServer],
    });

    expect(client.mcp.disconnect).toHaveBeenCalledWith({
      name: "stale",
      directory: "/app",
    });
    expect(warnings).toEqual([
      {
        serverName: "linear-mcp",
        message:
          "OpenCode MCP server linear-mcp is not connected (status=disconnected): bad token.",
      },
    ]);
  });
});
