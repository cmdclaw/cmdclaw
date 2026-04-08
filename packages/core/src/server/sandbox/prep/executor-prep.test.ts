import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fingerprintSource(source: {
  sourceId: string;
  endpoint: string;
  transport: string;
  queryParams: unknown;
  credential: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    metadata: unknown;
  } | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceId: source.sourceId,
        endpoint: source.endpoint,
        transport: source.transport,
        queryParams: source.queryParams,
        accessToken: source.credential?.accessToken,
        refreshToken: source.credential?.refreshToken ?? null,
        expiresAt: source.credential?.expiresAt?.toISOString() ?? null,
        metadata: source.credential?.metadata ?? null,
      }),
    )
    .digest("hex");
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

  it("waits for the template-managed executor server and validates the local server", async () => {
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
    await result?.finalize;
    expect(sandbox.ensureDir).toHaveBeenCalledWith("/app/.executor/state");
    expect(vi.mocked(sandbox.exec).mock.calls[0]?.[0]).toBe(
      "curl -fsS 'http://127.0.0.1:8788/' >/dev/null",
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("executor server did not become ready"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      3,
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
        stdout: '"ok"\n',
        stderr: "",
      });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });
    await result?.finalize;

    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("executor server did not become ready"),
      expect.objectContaining({
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

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });
    await result?.finalize;

    expect(sandbox.exec).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("/v1/local/secrets"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining("tools.executor.mcp.updateSource"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining("tools.executor.sources.refresh"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
  });

  it("starts access and refresh secret creation in parallel for the same source", async () => {
    const sandbox = makeSandboxHandle();
    const accessSecretDeferred = createDeferred<{ exitCode: number; stdout: string; stderr: string }>();
    const refreshSecretDeferred = createDeferred<{ exitCode: number; stdout: string; stderr: string }>();
    let secretRequestCount = 0;

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

    vi.mocked(sandbox.exec).mockImplementation((command) => {
      if (command.includes("/v1/local/secrets")) {
        secretRequestCount += 1;
        return secretRequestCount === 1
          ? accessSecretDeferred.promise
          : refreshSecretDeferred.promise;
      }
      if (command.includes("tools.executor.mcp.updateSource")) {
        return Promise.resolve({ exitCode: 0, stdout: '{"id":"source-1"}', stderr: "" });
      }
      if (command.includes("tools.executor.sources.refresh")) {
        return Promise.resolve({
          exitCode: 0,
          stdout: '{"id":"source-1","status":"connected"}',
          stderr: "",
        });
      }
      if (command.includes('return "ok"')) {
        return Promise.resolve({ exitCode: 0, stdout: '"ok"\n', stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const preparePromise = prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    await vi.waitFor(() => {
      expect(secretRequestCount).toBe(2);
    });

    const result = await preparePromise;
    accessSecretDeferred.resolve({ exitCode: 0, stdout: '{"id":"sec-access"}', stderr: "" });
    refreshSecretDeferred.resolve({ exitCode: 0, stdout: '{"id":"sec-refresh"}', stderr: "" });

    await result?.finalize;
  });

  it("returns prompt-ready executor bootstrap before oauth reconcile finishes", async () => {
    const sandbox = makeSandboxHandle();
    const accessSecretDeferred = createDeferred<{ exitCode: number; stdout: string; stderr: string }>();
    const refreshSecretDeferred = createDeferred<{ exitCode: number; stdout: string; stderr: string }>();
    let secretRequestCount = 0;

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

    vi.mocked(sandbox.exec).mockImplementation((command) => {
      if (command.includes("/v1/local/secrets")) {
        secretRequestCount += 1;
        return secretRequestCount === 1
          ? accessSecretDeferred.promise
          : refreshSecretDeferred.promise;
      }
      if (command.includes("tools.executor.mcp.updateSource")) {
        return Promise.resolve({ exitCode: 0, stdout: '{"id":"source-1"}', stderr: "" });
      }
      if (command.includes("tools.executor.sources.refresh")) {
        return Promise.resolve({
          exitCode: 0,
          stdout: '{"id":"source-1","status":"connected"}',
          stderr: "",
        });
      }
      if (command.includes('return "ok"')) {
        return Promise.resolve({ exitCode: 0, stdout: '"ok"\n', stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    let finalizeSettled = false;
    void result?.finalize.finally(() => {
      finalizeSettled = true;
    });

    expect(result?.instructions).toContain("## Executor Runtime");
    expect(finalizeSettled).toBe(false);

    accessSecretDeferred.resolve({ exitCode: 0, stdout: '{"id":"sec-access"}', stderr: "" });
    refreshSecretDeferred.resolve({ exitCode: 0, stdout: '{"id":"sec-refresh"}', stderr: "" });

    await expect(result?.finalize).resolves.toEqual({ oauthCacheHits: 0 });
    expect(finalizeSettled).toBe(true);
  });

  it("skips oauth reconciliation for unchanged credentials on reused runtimes", async () => {
    const sandbox = makeSandboxHandle();
    const unchangedSource = {
      sourceId: "source-1",
      name: "Linear",
      endpoint: "https://mcp.linear.app/mcp",
      transport: "streamable-http",
      queryParams: null,
      credential: {
        accessToken: "oauth-access",
        refreshToken: null,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        metadata: {
          tokenType: "Bearer",
          scope: "read",
          redirectUri: "https://app.example.com/api/oauth/callback",
          resourceMetadataUrl: null,
          authorizationServerUrl: "https://mcp.linear.app",
          resourceMetadata: null,
          authorizationServerMetadata: null,
          clientInformation: null,
        },
      },
    };
    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([unchangedSource]);

    const cacheContents = JSON.stringify({
      version: 1,
      sources: {
        "source-1": fingerprintSource(unchangedSource),
      },
    });

    vi.mocked(sandbox.readFile).mockResolvedValue(cacheContents);
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '"ok"\n', stderr: "" });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
      reuseExistingState: true,
    });

    expect(await result?.finalize).toEqual({ oauthCacheHits: 1 });
    expect(vi.mocked(sandbox.readFile)).toHaveBeenCalledWith(
      "/tmp/cmdclaw-executor/default/oauth-reconcile-cache.json",
    );
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) => command.includes("/v1/local/secrets")),
    ).toBe(false);
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) =>
        command.includes("tools.executor.mcp.updateSource"),
      ),
    ).toBe(false);
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) =>
        command.includes("tools.executor.sources.refresh"),
      ),
    ).toBe(false);
  });

  it("reconciles only changed oauth sources on reused runtimes", async () => {
    const sandbox = makeSandboxHandle();
    const unchangedSource = {
      sourceId: "source-1",
      name: "Linear",
      endpoint: "https://mcp.linear.app/mcp",
      transport: "streamable-http",
      queryParams: null,
      credential: {
        accessToken: "oauth-access",
        refreshToken: null,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        metadata: {
          tokenType: "Bearer",
          scope: "read",
          redirectUri: "https://app.example.com/api/oauth/callback",
          resourceMetadataUrl: null,
          authorizationServerUrl: "https://mcp.linear.app",
          resourceMetadata: null,
          authorizationServerMetadata: null,
          clientInformation: null,
        },
      },
    };
    const changedSource = {
      sourceId: "source-2",
      name: "GitHub",
      endpoint: "https://api.githubcopilot.com/mcp",
      transport: "streamable-http",
      queryParams: null,
      credential: {
        accessToken: "oauth-access-updated",
        refreshToken: null,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        metadata: {
          tokenType: "Bearer",
          scope: "repo",
          redirectUri: "https://app.example.com/api/oauth/callback",
          resourceMetadataUrl: null,
          authorizationServerUrl: "https://github.com",
          resourceMetadata: null,
          authorizationServerMetadata: null,
          clientInformation: null,
        },
      },
    };
    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([
      unchangedSource,
      changedSource,
    ]);

    vi.mocked(sandbox.readFile).mockResolvedValue(
      JSON.stringify({
        version: 1,
        sources: {
          "source-1": fingerprintSource(unchangedSource),
          "source-2": "stale-fingerprint",
        },
      }),
    );
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '"ok"\n', stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '{"id":"sec-source-2"}', stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '{"id":"source-2"}', stderr: "" })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '{"id":"source-2","status":"connected"}',
        stderr: "",
      });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
      reuseExistingState: true,
    });

    expect(await result?.finalize).toEqual({ oauthCacheHits: 1 });
    expect(
      vi.mocked(sandbox.exec).mock.calls.filter(([command]) => command.includes("/v1/local/secrets"))
        .length,
    ).toBe(1);
    expect(
      vi.mocked(sandbox.exec).mock.calls.filter(([command]) =>
        command.includes("tools.executor.mcp.updateSource"),
      ).length,
    ).toBe(1);
    expect(
      vi.mocked(sandbox.exec).mock.calls.filter(([command]) =>
        command.includes("tools.executor.sources.refresh"),
      ).length,
    ).toBe(1);
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
        stdout: '"ok"\n',
        stderr: "",
      });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });
    await result?.finalize;

    expect(sandbox.exec).toHaveBeenCalledTimes(3);
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

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
      onPhase: (phase, status) => {
        phases.push(`${phase}:${status}`);
      },
    });
    await result?.finalize;

    expect(phases).toEqual([
      "bootstrap_load:started",
      "bootstrap_load:completed",
      "config_write:started",
      "config_write:completed",
      "server_probe:started",
      "server_probe:completed",
      "server_wait_ready:started",
      "server_wait_ready:completed",
      "status_check:started",
      "status_check:completed",
      "oauth_reconcile:started",
      "oauth_reconcile:completed",
    ]);
  });
});
