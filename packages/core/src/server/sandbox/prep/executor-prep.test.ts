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

const EXECUTOR_HOME = "/tmp/cmdclaw-executor/default";
const EXECUTOR_SCOPE_DIR = `${EXECUTOR_HOME}/scope`;
const EXECUTOR_DATA_DIR = `${EXECUTOR_HOME}/data`;
const EXECUTOR_CONFIG_PATH = `${EXECUTOR_SCOPE_DIR}/executor.jsonc`;
const EXECUTOR_SCOPE_INFO = {
  id: "scope-1",
  name: EXECUTOR_SCOPE_DIR,
  dir: EXECUTOR_SCOPE_DIR,
};

function makeSandboxHandle(provider: SandboxHandle["provider"] = "e2b"): SandboxHandle {
  return {
    provider,
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
  namespace: string;
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
        namespace: source.namespace,
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

function matchCommand(command: string, needle: string): boolean {
  return command.includes(needle);
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
      configJson: `${JSON.stringify(
        {
          workspace: { name: "Workspace" },
          sources: {
            "source-1": {
              kind: "openapi",
              name: "CRM",
              namespace: "crm",
              enabled: true,
              config: {
                specUrl: "https://example.com/openapi.json",
                baseUrl: "https://example.com",
                defaultHeaders: {
                  Authorization: "Bearer test",
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
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

  it("writes translated executor config, restarts the daemon, and validates scope info", async () => {
    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
        stderr: "",
      });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    expect(result?.sourceCount).toBe(1);
    expect(await result?.finalize()).toEqual({ oauthCacheHits: 0 });

    expect(sandbox.ensureDir).toHaveBeenCalledWith(EXECUTOR_HOME);
    expect(sandbox.ensureDir).toHaveBeenCalledWith(EXECUTOR_SCOPE_DIR);
    expect(sandbox.ensureDir).toHaveBeenCalledWith(EXECUTOR_DATA_DIR);
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      EXECUTOR_CONFIG_PATH,
      expect.stringContaining('"kind": "openapi"'),
    );
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      EXECUTOR_CONFIG_PATH,
      expect.stringContaining('"spec": "https://example.com/openapi.json"'),
    );
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      EXECUTOR_CONFIG_PATH,
      expect.not.stringContaining('"specUrl"'),
    );
    expect(vi.mocked(sandbox.exec).mock.calls[0]?.[0]).toBe(
      "curl -fsS 'http://127.0.0.1:8788/api/scope' >/dev/null",
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("executor daemon stop"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME,
          EXECUTOR_SCOPE_DIR,
          EXECUTOR_DATA_DIR,
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("nohup executor daemon run --hostname 127.0.0.1 --port 8788"),
      expect.any(Object),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      4,
      "curl -fsS -X GET 'http://127.0.0.1:8788/api/scope'",
      expect.objectContaining({
        env: {
          EXECUTOR_HOME,
          EXECUTOR_SCOPE_DIR,
          EXECUTOR_DATA_DIR,
        },
      }),
    );
  });

  it("throws when executor scope info is not reachable after daemon startup", async () => {
    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "server unreachable" });

    await expect(
      prepareExecutorInSandbox({
        sandbox,
        workspaceId: "workspace-1",
        workspaceName: "Workspace",
        userId: "user-1",
      }),
    ).rejects.toThrow("Executor scope info failed");
  });

  it("inlines executor env into daytona commands instead of relying on SDK env injection", async () => {
    const sandbox = makeSandboxHandle("daytona");
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
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
      expect.stringContaining(
        "env EXECUTOR_HOME='/tmp/cmdclaw-executor/default' EXECUTOR_SCOPE_DIR='/tmp/cmdclaw-executor/default/scope' EXECUTOR_DATA_DIR='/tmp/cmdclaw-executor/default/data' bash -lc",
      ),
      expect.objectContaining({
        env: undefined,
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      4,
      "env EXECUTOR_HOME='/tmp/cmdclaw-executor/default' EXECUTOR_SCOPE_DIR='/tmp/cmdclaw-executor/default/scope' EXECUTOR_DATA_DIR='/tmp/cmdclaw-executor/default/data' curl -fsS -X GET 'http://127.0.0.1:8788/api/scope'",
      expect.objectContaining({
        env: undefined,
      }),
    );
  });

  it("skips executor prep when an explicit empty source allowlist is provided", async () => {
    const sandbox = makeSandboxHandle();

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
      allowedSourceIds: [],
    });

    expect(result).toBeNull();
    expect(getWorkspaceExecutorBootstrapMock).not.toHaveBeenCalled();
    expect(getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock).not.toHaveBeenCalled();
    expect(sandbox.exec).not.toHaveBeenCalled();
  });

  it("passes tracing env through to the sandboxed executor daemon when enabled", async () => {
    process.env.EXECUTOR_TRACE_ENABLED = "1";
    process.env.EXECUTOR_TRACE_SERVICE_NAME = "executor-e2b";
    process.env.EXECUTOR_TRACE_OTLP_ENDPOINT = "http://trace.example:4317";
    process.env.EXECUTOR_TRACE_QUERY_BASE_URL = "http://trace.example:16686";

    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
        stderr: "",
      });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });
    await result?.finalize();

    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("executor daemon stop"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME,
          EXECUTOR_SCOPE_DIR,
          EXECUTOR_DATA_DIR,
          EXECUTOR_TRACE_ENABLED: "1",
          EXECUTOR_TRACE_SERVICE_NAME: "executor-e2b",
          EXECUTOR_TRACE_OTLP_ENDPOINT: "http://trace.example:4317",
          EXECUTOR_TRACE_QUERY_BASE_URL: "http://trace.example:16686",
        },
      }),
    );
  });

  it("reconciles native MCP OAuth sources through scoped secrets and MCP patch/refresh endpoints", async () => {
    const sandbox = makeSandboxHandle();
    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([
      {
        sourceId: "source-1",
        namespace: "linear",
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

    vi.mocked(sandbox.exec).mockImplementation(async (command) => {
      if (matchCommand(command, "/api/scopes/scope-1/secrets")) {
        const secretIdMatch = command.match(/"id":"([^"]+)"/);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ id: secretIdMatch?.[1] ?? "secret-id" }),
          stderr: "",
        };
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/linear") && matchCommand(command, "-X PATCH")) {
        return { exitCode: 0, stdout: JSON.stringify({ updated: true }), stderr: "" };
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/refresh")) {
        return { exitCode: 0, stdout: JSON.stringify({ toolCount: 3 }), stderr: "" };
      }
      if (matchCommand(command, "-X GET 'http://127.0.0.1:8788/api/scope'")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });
    await result?.finalize();

    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) =>
        command.includes("/api/scopes/scope-1/secrets"),
      ),
    ).toBe(true);
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) =>
        command.includes("/api/scopes/scope-1/mcp/sources/linear"),
      ),
    ).toBe(true);
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) =>
        command.includes("/api/scopes/scope-1/mcp/sources/refresh"),
      ),
    ).toBe(true);
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) =>
        command.includes('"headerName":"Authorization"') &&
        command.includes('"kind":"header"'),
      ),
    ).toBe(true);
  });

  it("starts access and refresh secret creation in parallel for the same source", async () => {
    const sandbox = makeSandboxHandle();
    const accessSecretDeferred = createDeferred<{ exitCode: number; stdout: string; stderr: string }>();
    const refreshSecretDeferred = createDeferred<{ exitCode: number; stdout: string; stderr: string }>();
    let secretRequestCount = 0;

    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([
      {
        sourceId: "source-1",
        namespace: "linear",
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
      if (matchCommand(command, "/api/scopes/scope-1/secrets")) {
        secretRequestCount += 1;
        return secretRequestCount === 1 ? accessSecretDeferred.promise : refreshSecretDeferred.promise;
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/linear") && matchCommand(command, "-X PATCH")) {
        return Promise.resolve({ exitCode: 0, stdout: '{"updated":true}', stderr: "" });
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/refresh")) {
        return Promise.resolve({ exitCode: 0, stdout: '{"toolCount":1}', stderr: "" });
      }
      if (matchCommand(command, "-X GET 'http://127.0.0.1:8788/api/scope'")) {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const preparePromise = prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    const result = await preparePromise;
    const finalizePromise = result?.finalize();

    await vi.waitFor(() => {
      expect(secretRequestCount).toBe(2);
    });

    accessSecretDeferred.resolve({ exitCode: 0, stdout: '{"id":"sec-access"}', stderr: "" });
    refreshSecretDeferred.resolve({ exitCode: 0, stdout: '{"id":"sec-refresh"}', stderr: "" });

    await finalizePromise;
  });

  it("serializes MCP source patch requests across multiple oauth sources", async () => {
    const sandbox = makeSandboxHandle();
    let activeUpdateCount = 0;
    let maxConcurrentUpdates = 0;

    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([
      {
        sourceId: "source-1",
        namespace: "linear",
        name: "Linear",
        endpoint: "https://mcp.linear.app/mcp",
        transport: "streamable-http",
        queryParams: null,
        credential: {
          accessToken: "oauth-access-1",
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
      },
      {
        sourceId: "source-2",
        namespace: "github",
        name: "GitHub",
        endpoint: "https://api.githubcopilot.com/mcp",
        transport: "streamable-http",
        queryParams: null,
        credential: {
          accessToken: "oauth-access-2",
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
      },
    ]);

    vi.mocked(sandbox.exec).mockImplementation(async (command) => {
      if (matchCommand(command, "/api/scopes/scope-1/secrets")) {
        const secretIdMatch = command.match(/"id":"([^"]+)"/);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ id: secretIdMatch?.[1] ?? "secret-id" }),
          stderr: "",
        };
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/") && matchCommand(command, "-X PATCH")) {
        activeUpdateCount += 1;
        maxConcurrentUpdates = Math.max(maxConcurrentUpdates, activeUpdateCount);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeUpdateCount -= 1;
        return { exitCode: 0, stdout: '{"updated":true}', stderr: "" };
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/refresh")) {
        return { exitCode: 0, stdout: '{"toolCount":1}', stderr: "" };
      }
      if (matchCommand(command, "-X GET 'http://127.0.0.1:8788/api/scope'")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    await result?.finalize();

    expect(maxConcurrentUpdates).toBe(1);
    expect(
      vi.mocked(sandbox.exec).mock.calls.filter(
        ([command]) =>
          command.includes("/api/scopes/scope-1/mcp/sources/") && command.includes("-X PATCH"),
      ).length,
    ).toBe(2);
  });

  it("returns prompt-ready executor bootstrap before oauth reconcile finishes", async () => {
    const sandbox = makeSandboxHandle();
    const accessSecretDeferred = createDeferred<{ exitCode: number; stdout: string; stderr: string }>();
    const refreshSecretDeferred = createDeferred<{ exitCode: number; stdout: string; stderr: string }>();
    let secretRequestCount = 0;

    getWorkspaceExecutorNativeMcpOAuthBootstrapSourcesMock.mockResolvedValue([
      {
        sourceId: "source-1",
        namespace: "linear",
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
      if (matchCommand(command, "/api/scopes/scope-1/secrets")) {
        secretRequestCount += 1;
        return secretRequestCount === 1 ? accessSecretDeferred.promise : refreshSecretDeferred.promise;
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/linear") && matchCommand(command, "-X PATCH")) {
        return Promise.resolve({ exitCode: 0, stdout: '{"updated":true}', stderr: "" });
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/refresh")) {
        return Promise.resolve({ exitCode: 0, stdout: '{"toolCount":1}', stderr: "" });
      }
      if (matchCommand(command, "-X GET 'http://127.0.0.1:8788/api/scope'")) {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
          stderr: "",
        });
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
    const finalizePromise = result?.finalize();
    void finalizePromise?.finally(() => {
      finalizeSettled = true;
    });

    expect(result?.instructions).toContain("## Executor Runtime");
    expect(finalizeSettled).toBe(false);

    accessSecretDeferred.resolve({ exitCode: 0, stdout: '{"id":"sec-access"}', stderr: "" });
    refreshSecretDeferred.resolve({ exitCode: 0, stdout: '{"id":"sec-refresh"}', stderr: "" });

    await expect(finalizePromise).resolves.toEqual({ oauthCacheHits: 0 });
    expect(finalizeSettled).toBe(true);
  });

  it("skips oauth reconciliation for unchanged credentials on reused runtimes", async () => {
    const sandbox = makeSandboxHandle();
    const unchangedSource = {
      sourceId: "source-1",
      namespace: "linear",
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
    vi.mocked(sandbox.exec).mockImplementation(async (command) => {
      if (matchCommand(command, "-X GET 'http://127.0.0.1:8788/api/scope'")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
      reuseExistingState: true,
    });

    expect(await result?.finalize()).toEqual({ oauthCacheHits: 1 });
    expect(vi.mocked(sandbox.readFile)).toHaveBeenCalledWith(
      "/tmp/cmdclaw-executor/default/oauth-reconcile-cache.json",
    );
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) => command.includes("/api/scopes/scope-1/secrets")),
    ).toBe(false);
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) => command.includes("/mcp/sources/") && command.includes("-X PATCH")),
    ).toBe(false);
    expect(
      vi.mocked(sandbox.exec).mock.calls.some(([command]) => command.includes("/mcp/sources/refresh")),
    ).toBe(false);
  });

  it("reconciles only changed oauth sources on reused runtimes", async () => {
    const sandbox = makeSandboxHandle();
    const unchangedSource = {
      sourceId: "source-1",
      namespace: "linear",
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
      namespace: "github",
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
    vi.mocked(sandbox.exec).mockImplementation(async (command) => {
      if (matchCommand(command, "/api/scopes/scope-1/secrets")) {
        const secretIdMatch = command.match(/"id":"([^"]+)"/);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ id: secretIdMatch?.[1] ?? "secret-id" }),
          stderr: "",
        };
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/github") && matchCommand(command, "-X PATCH")) {
        return { exitCode: 0, stdout: '{"updated":true}', stderr: "" };
      }
      if (matchCommand(command, "/api/scopes/scope-1/mcp/sources/refresh")) {
        return { exitCode: 0, stdout: '{"toolCount":1}', stderr: "" };
      }
      if (matchCommand(command, "-X GET 'http://127.0.0.1:8788/api/scope'")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
      reuseExistingState: true,
    });

    expect(await result?.finalize()).toEqual({ oauthCacheHits: 1 });
    expect(
      vi.mocked(sandbox.exec).mock.calls.filter(([command]) => command.includes("/api/scopes/scope-1/secrets"))
        .length,
    ).toBe(1);
    expect(
      vi.mocked(sandbox.exec).mock.calls.filter(([command]) => command.includes("/mcp/sources/github") && command.includes("-X PATCH"))
        .length,
    ).toBe(1);
    expect(
      vi.mocked(sandbox.exec).mock.calls.filter(([command]) => command.includes("/mcp/sources/refresh"))
        .length,
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
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
        stderr: "",
      });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });
    expect(await result?.finalize()).toEqual({ oauthCacheHits: 0 });

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
        stdout: JSON.stringify(EXECUTOR_SCOPE_INFO),
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
    expect(await result?.finalize()).toEqual({ oauthCacheHits: 0 });

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
