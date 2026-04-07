import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxHandle } from "../core/types";
import { prepareExecutorInSandbox } from "./executor-prep";

process.env.BETTER_AUTH_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/cmdclaw_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.OPENAI_API_KEY ??= "test-openai-key";
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.SANDBOX_DEFAULT ??= "docker";
process.env.ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.CMDCLAW_SERVER_SECRET ??= "test-server-secret";
process.env.AWS_ENDPOINT_URL ??= "http://localhost:9000";
process.env.AWS_ACCESS_KEY_ID ??= "test-access-key";
process.env.AWS_SECRET_ACCESS_KEY ??= "test-secret-key";

const {
  getWorkspaceExecutorBootstrapMock,
  getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock,
} = vi.hoisted(() => ({
  getWorkspaceExecutorBootstrapMock: vi.fn(),
  getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock: vi.fn(),
}));

vi.mock("../../executor/workspace-sources", () => ({
  getWorkspaceExecutorBootstrap: getWorkspaceExecutorBootstrapMock,
  getWorkspaceExecutorNativeMcpOAuthBootstrapSources:
    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock,
}));

function makeSandboxHandle(): SandboxHandle {
  return {
    provider: "e2b",
    sandboxId: "sandbox-1",
    exec: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    ensureDir: vi.fn(),
  };
}

describe("prepareExecutorInSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EXECUTOR_TRACE_ENABLED;
    delete process.env.EXECUTOR_TRACE_SERVICE_NAME;
    delete process.env.EXECUTOR_TRACE_OTLP_ENDPOINT;
    delete process.env.EXECUTOR_TRACE_OTLP_HTTP_ENDPOINT;
    delete process.env.EXECUTOR_TRACE_QUERY_BASE_URL;
    getWorkspaceExecutorBootstrapMock.mockResolvedValue({
      revisionHash: "rev-1",
      configJson: "{\n  \"sources\": {}\n}\n",
      workspaceStateJson: "{\n  \"workspace\": true\n}\n",
      sources: [
        {
          id: "source-1",
          name: "CRM",
          namespace: "crm",
          kind: "openapi",
          enabled: true,
          connected: true,
        },
      ],
    });
    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([]);
  });

  it("starts executor via executor server start and validates the local server", async () => {
    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '"ok"\n',
        stderr: "",
      });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    expect(result?.sourceCount).toBe(1);
    expect(sandbox.ensureDir).toHaveBeenCalledWith("/app/.executor/state");
    expect(vi.mocked(sandbox.exec).mock.calls[0]?.[0]).toBe(
      "curl -fsS 'http://127.0.0.1:8788/' >/dev/null",
    );
    expect(vi.mocked(sandbox.exec).mock.calls[1]?.[0]).toContain(
      "executor server start --port 8788",
    );
    expect(vi.mocked(sandbox.exec).mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        background: true,
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("executor server did not become ready"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      4,
      `executor call --base-url 'http://127.0.0.1:8788' --no-open 'return "ok"'`,
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
  });

  it("throws when executor status is not reachable even if the command exits zero", async () => {
    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "server unreachable",
      });

    await expect(
      prepareExecutorInSandbox({
        sandbox,
        workspaceId: "workspace-1",
        workspaceName: "Workspace",
        userId: "user-1",
      }),
    ).rejects.toThrow("Executor status check failed");
  });

  it("passes tracing env through to the sandboxed executor when enabled", async () => {
    process.env.EXECUTOR_TRACE_ENABLED = "1";
    process.env.EXECUTOR_TRACE_SERVICE_NAME = "executor-e2b";
    process.env.EXECUTOR_TRACE_OTLP_ENDPOINT = "http://trace.example:4317";
    process.env.EXECUTOR_TRACE_QUERY_BASE_URL = "http://trace.example:16686";

    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '"ok"\n',
        stderr: "",
      });

    await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("executor server start --port 8788"),
      expect.objectContaining({
        background: true,
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
          EXECUTOR_TRACE_ENABLED: "1",
          EXECUTOR_TRACE_SERVICE_NAME: "executor-e2b",
          EXECUTOR_TRACE_OTLP_ENDPOINT: "http://trace.example:4317",
          EXECUTOR_TRACE_QUERY_BASE_URL: "http://trace.example:16686",
        },
      }),
    );
  });

  it("reconciles native MCP OAuth sources by creating secrets, updating config, and refreshing", async () => {
    const sandbox = makeSandboxHandle();
    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([
      {
        sourceId: "source-1",
        name: "Linear",
        endpoint: "https://mcp.linear.app/mcp",
        transport: "streamable-http",
        queryParams: null,
        credential: {
          accessToken: "oauth-access",
          refreshToken: "oauth-refresh",
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          metadata: {
            tokenType: "Bearer",
            scope: "read write",
            redirectUri: "https://app.example.com/api/oauth/callback",
            resourceMetadataUrl: null,
            authorizationServerUrl: "https://mcp.linear.app",
            resourceMetadata: null,
            authorizationServerMetadata: null,
            clientInformation: null,
          },
        },
      },
    ]);
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '"ok"\n',
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '{"id":"sec-access"}',
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '{"id":"sec-refresh"}',
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '{"id":"source-1"}',
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '{"id":"source-1","status":"connected"}',
        stderr: "",
      });

    await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    expect(sandbox.exec).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("/v1/local/secrets"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining("tools.executor.mcp.updateSource"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      8,
      expect.stringContaining("tools.executor.sources.refresh"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
  });

  it("skips native MCP OAuth reconciliation when no credential is available", async () => {
    const sandbox = makeSandboxHandle();
    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([
      {
        sourceId: "source-1",
        name: "Linear",
        endpoint: "https://mcp.linear.app/mcp",
        transport: "streamable-http",
        queryParams: null,
        credential: null,
      },
    ]);
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '"ok"\n',
        stderr: "",
      });

    await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    expect(sandbox.exec).toHaveBeenCalledTimes(4);
  });

  it("emits detailed executor bootstrap phases", async () => {
    const sandbox = makeSandboxHandle();
    const phases: string[] = [];
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '"ok"\n',
        stderr: "",
      });

    await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
      onPhase: (phase, status) => {
        phases.push(`${phase}:${status}`);
      },
    });

    expect(phases).toEqual([
      "bootstrap_load:started",
      "bootstrap_load:completed",
      "config_write:started",
      "config_write:completed",
      "server_probe:started",
      "server_probe:completed",
      "server_start:started",
      "server_start:completed",
      "server_wait_ready:started",
      "server_wait_ready:completed",
      "status_check:started",
      "status_check:completed",
      "oauth_reconcile:started",
      "oauth_reconcile:completed",
    ]);
  });
});
