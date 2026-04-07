import {
  getWorkspaceExecutorBootstrap,
  getWorkspaceExecutorNativeMcpOAuthBootstrapSources,
  type WorkspaceExecutorNativeMcpOauthBootstrapSource,
} from "../../executor/workspace-sources";
import type { SandboxHandle } from "../core/types";

const EXECUTOR_BASE_URL = "http://127.0.0.1:8788";
const EXECUTOR_WORKSPACE_ROOT = "/app";
const EXECUTOR_SERVER_PORT = 8788;
const EXECUTOR_SERVER_LOG_PATH = "/tmp/cmdclaw-executor-server.log";
const DEFAULT_EXECUTOR_TRACE_SERVICE_NAME = "cmdclaw-sandbox-executor";

function escapeShell(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function trimEnv(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate && candidate.length > 0 ? candidate : undefined;
}

function envFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function buildExecutorCommandEnv(homeDirectory: string): Record<string, string> {
  const commandEnv: Record<string, string> = {
    EXECUTOR_HOME: homeDirectory,
  };

  if (!envFlag(process.env.EXECUTOR_TRACE_ENABLED)) {
    return commandEnv;
  }

  commandEnv.EXECUTOR_TRACE_ENABLED = "1";
  commandEnv.EXECUTOR_TRACE_SERVICE_NAME =
    trimEnv(process.env.EXECUTOR_TRACE_SERVICE_NAME) ?? DEFAULT_EXECUTOR_TRACE_SERVICE_NAME;

  const otlpEndpoint = trimEnv(process.env.EXECUTOR_TRACE_OTLP_ENDPOINT);
  if (otlpEndpoint) {
    commandEnv.EXECUTOR_TRACE_OTLP_ENDPOINT = otlpEndpoint;
  }

  const otlpHttpEndpoint = trimEnv(process.env.EXECUTOR_TRACE_OTLP_HTTP_ENDPOINT);
  if (otlpHttpEndpoint) {
    commandEnv.EXECUTOR_TRACE_OTLP_HTTP_ENDPOINT = otlpHttpEndpoint;
  }

  const queryBaseUrl = trimEnv(process.env.EXECUTOR_TRACE_QUERY_BASE_URL);
  if (queryBaseUrl) {
    commandEnv.EXECUTOR_TRACE_QUERY_BASE_URL = queryBaseUrl;
  }

  return commandEnv;
}

export type ExecutorSandboxBootstrap = {
  revisionHash: string;
  sourceCount: number;
  baseUrl: string;
  homeDirectory: string;
  instructions: string;
};

export type ExecutorPreparePhase =
  | "bootstrap_load"
  | "config_write"
  | "server_probe"
  | "server_start"
  | "server_wait_ready"
  | "status_check"
  | "oauth_reconcile";

function isCommandExitErrorLike(
  error: unknown,
): error is { result: { exitCode?: number; stdout?: string; stderr?: string } } {
  return typeof error === "object" && error !== null && "result" in error;
}

async function execNoThrow(
  sandbox: SandboxHandle,
  command: string,
  opts?: {
    timeoutMs?: number;
    env?: Record<string, string>;
    background?: boolean;
    onStderr?: (chunk: string) => void;
  },
) {
  try {
    return await sandbox.exec(command, opts);
  } catch (error) {
    if (!isCommandExitErrorLike(error)) {
      throw error;
    }

    return {
      exitCode: error.result.exitCode ?? 1,
      stdout: error.result.stdout ?? "",
      stderr: error.result.stderr ?? "",
    };
  }
}

function parseJsonResult<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(
      `${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function createExecutorLocalSecret(input: {
  sandbox: SandboxHandle;
  env: Record<string, string>;
  name: string;
  value: string;
}): Promise<string> {
  const payload = JSON.stringify({
    name: input.name,
    value: input.value,
  });
  const result = await execNoThrow(
    input.sandbox,
    [
      "curl -fsS -X POST",
      `${escapeShell(`${EXECUTOR_BASE_URL}/v1/local/secrets`)}`,
      "-H 'content-type: application/json'",
      `--data ${escapeShell(payload)}`,
    ].join(" "),
    {
      timeoutMs: 15_000,
      env: input.env,
    },
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Executor secret creation failed (exit=${result.exitCode}): ${
        result.stderr || result.stdout || "unknown error"
      }`,
    );
  }

  const secret = parseJsonResult<{ id?: string }>(result.stdout, "Executor secret creation");
  if (!secret.id) {
    throw new Error("Executor secret creation did not return a secret id.");
  }

  return secret.id;
}

function buildNativeMcpOauthSourceConfig(
  source: WorkspaceExecutorNativeMcpOauthBootstrapSource,
  accessTokenSecretId: string,
  refreshTokenSecretId: string | null,
) {
  if (!source.credential) {
    throw new Error(`Missing OAuth credential for source ${source.sourceId}`);
  }

  return {
    name: source.name,
    endpoint: source.endpoint,
    transport: source.transport,
    queryParams: source.queryParams,
    headers: null,
    command: null,
    args: null,
    env: null,
    cwd: null,
    auth: {
      kind: "oauth2" as const,
      redirectUri: source.credential.metadata.redirectUri,
      accessTokenRef: {
        secretId: accessTokenSecretId,
      },
      refreshTokenRef: refreshTokenSecretId ? { secretId: refreshTokenSecretId } : null,
      tokenType: source.credential.metadata.tokenType.toLowerCase(),
      expiresAt: source.credential.expiresAt?.getTime() ?? null,
      scope: source.credential.metadata.scope,
      resourceMetadataUrl: source.credential.metadata.resourceMetadataUrl,
      authorizationServerUrl: source.credential.metadata.authorizationServerUrl,
      resourceMetadata: source.credential.metadata.resourceMetadata,
      authorizationServerMetadata: source.credential.metadata.authorizationServerMetadata,
      clientInformation: source.credential.metadata.clientInformation,
    },
  };
}

async function reconcileNativeMcpOAuthSourcesInSandbox(input: {
  sandbox: SandboxHandle;
  env: Record<string, string>;
  sources: WorkspaceExecutorNativeMcpOauthBootstrapSource[];
}) {
  for (const source of input.sources) {
    if (!source.credential) {
      continue;
    }

    const accessTokenSecretId = await createExecutorLocalSecret({
      sandbox: input.sandbox,
      env: input.env,
      name: `${source.name} access token`,
      value: source.credential.accessToken,
    });
    const refreshTokenSecretId = source.credential.refreshToken
      ? await createExecutorLocalSecret({
          sandbox: input.sandbox,
          env: input.env,
          name: `${source.name} refresh token`,
          value: source.credential.refreshToken,
        })
      : null;
    const updateCode = `return await tools.executor.mcp.updateSource(${JSON.stringify({
      sourceId: source.sourceId,
      config: buildNativeMcpOauthSourceConfig(source, accessTokenSecretId, refreshTokenSecretId),
    })})`;
    const updateResult = await execNoThrow(
      input.sandbox,
      `executor call --base-url ${escapeShell(EXECUTOR_BASE_URL)} --no-open ${escapeShell(updateCode)}`,
      {
        timeoutMs: 30_000,
        env: input.env,
      },
    );

    if (updateResult.exitCode !== 0) {
      throw new Error(
        `Executor MCP native update failed for ${source.sourceId} (exit=${updateResult.exitCode}): ${
          updateResult.stderr || updateResult.stdout || "unknown error"
        }`,
      );
    }

    const refreshCode = `return await tools.executor.sources.refresh(${JSON.stringify({
      sourceId: source.sourceId,
    })})`;
    const refreshResult = await execNoThrow(
      input.sandbox,
      `executor call --base-url ${escapeShell(EXECUTOR_BASE_URL)} --no-open ${escapeShell(refreshCode)}`,
      {
        timeoutMs: 30_000,
        env: input.env,
      },
    );

    if (refreshResult.exitCode !== 0) {
      throw new Error(
        `Executor source refresh failed for ${source.sourceId} (exit=${refreshResult.exitCode}): ${
          refreshResult.stderr || refreshResult.stdout || "unknown error"
        }`,
      );
    }
  }
}

export async function prepareExecutorInSandbox(input: {
  sandbox: SandboxHandle;
  workspaceId: string | null | undefined;
  workspaceName?: string | null;
  userId: string;
  allowedSourceIds?: string[] | null;
  runtimeId?: string | null;
  onPhase?: (phase: ExecutorPreparePhase, status: "started" | "completed") => void;
}): Promise<ExecutorSandboxBootstrap | null> {
  const runPhase = async <T>(phase: ExecutorPreparePhase, action: () => Promise<T>): Promise<T> => {
    input.onPhase?.(phase, "started");
    try {
      return await action();
    } finally {
      input.onPhase?.(phase, "completed");
    }
  };

  if (!input.workspaceId) {
    return null;
  }
  const workspaceId = input.workspaceId;

  const [bootstrap, nativeMcpOauthSources] = await runPhase("bootstrap_load", async () =>
    await Promise.all([
      getWorkspaceExecutorBootstrap({
        workspaceId,
        workspaceName: input.workspaceName,
        userId: input.userId,
        allowedSourceIds: input.allowedSourceIds,
      }),
      getWorkspaceExecutorNativeMcpOAuthBootstrapSources({
        workspaceId,
        userId: input.userId,
        allowedSourceIds: input.allowedSourceIds,
      }),
    ]),
  );

  if (bootstrap.sources.length === 0) {
    return null;
  }

  const homeDirectory = input.runtimeId
    ? `/tmp/cmdclaw-executor/${input.runtimeId}`
    : "/tmp/cmdclaw-executor/default";
  const executorCommandEnv = buildExecutorCommandEnv(homeDirectory);

  await runPhase("config_write", async () => {
    await input.sandbox.ensureDir("/app/.executor/state");
    await input.sandbox.writeFile("/app/.executor/executor.jsonc", bootstrap.configJson);
    await input.sandbox.writeFile(
      "/app/.executor/state/workspace-state.json",
      bootstrap.workspaceStateJson,
    );
  });

  const serverReadyResult = await runPhase("server_probe", async () =>
    await execNoThrow(
      input.sandbox,
      `curl -fsS ${escapeShell(`${EXECUTOR_BASE_URL}/`)} >/dev/null`,
      {
        timeoutMs: 5_000,
        env: executorCommandEnv,
      },
    ),
  );

  if (serverReadyResult.exitCode !== 0) {
    const startResult = await runPhase("server_start", async () =>
      await execNoThrow(
        input.sandbox,
        `cd ${escapeShell(EXECUTOR_WORKSPACE_ROOT)} && executor server start --port ${EXECUTOR_SERVER_PORT} >${escapeShell(
          EXECUTOR_SERVER_LOG_PATH,
        )} 2>&1`,
        {
          timeoutMs: 0,
          background: true,
          env: executorCommandEnv,
        },
      ),
    );

    if (startResult.exitCode !== 0) {
      throw new Error(
        `Executor bootstrap failed (exit=${startResult.exitCode}): ${
          startResult.stderr || startResult.stdout || "unknown error"
        }`,
      );
    }
  }

  const waitCommand = [
    "for _ in $(seq 1 30); do",
    `curl -fsS ${escapeShell(`${EXECUTOR_BASE_URL}/`)} >/dev/null 2>&1 && exit 0;`,
    "sleep 1;",
    "done;",
    `echo ${escapeShell(`executor server did not become ready; see ${EXECUTOR_SERVER_LOG_PATH}`)} >&2;`,
    `tail -n 40 ${escapeShell(EXECUTOR_SERVER_LOG_PATH)} >&2 || true;`,
    "exit 1",
  ].join(" ");

  const startResult = await runPhase("server_wait_ready", async () =>
    await execNoThrow(input.sandbox, `bash -lc ${escapeShell(waitCommand)}`, {
      timeoutMs: 45_000,
      env: executorCommandEnv,
    }),
  );

  if (startResult.exitCode !== 0) {
    throw new Error(
      `Executor bootstrap failed (exit=${startResult.exitCode}): ${
        startResult.stderr || startResult.stdout || "unknown error"
      }`,
    );
  }

  const statusResult = await runPhase("status_check", async () =>
    await execNoThrow(
      input.sandbox,
      `executor call --base-url ${escapeShell(EXECUTOR_BASE_URL)} --no-open ${escapeShell(
        'return "ok"',
      )}`,
      {
        timeoutMs: 15_000,
        env: executorCommandEnv,
      },
    ),
  );

  if (statusResult.exitCode !== 0) {
    throw new Error(
      `Executor status check failed (exit=${statusResult.exitCode}): ${
        statusResult.stderr || statusResult.stdout || "unknown error"
      }`,
    );
  }

  await runPhase("oauth_reconcile", async () => {
    await reconcileNativeMcpOAuthSourcesInSandbox({
      sandbox: input.sandbox,
      env: executorCommandEnv,
      sources: nativeMcpOauthSources,
    });
  });

  const lines = [
    "## Executor Runtime",
    "CmdClaw prepared a sandbox-local executor workspace for shared workspace sources.",
    `Executor workspace root: \`${EXECUTOR_WORKSPACE_ROOT}\``,
    `Executor base URL: \`${EXECUTOR_BASE_URL}\``,
    `Executor home: \`${homeDirectory}\``,
    "Use executor through the local server instead of editing `.executor` files manually.",
    "Useful commands:",
    `- \`curl -fsS ${EXECUTOR_BASE_URL}/ >/dev/null && echo 'executor ready'\``,
    `- \`EXECUTOR_HOME=${homeDirectory} executor call --base-url ${EXECUTOR_BASE_URL} --no-open 'const tools = await catalog.tools(); return tools;'\``,
    "Inside executor code, use the discovery workflow and call `tools.*` APIs rather than raw fetch.",
    "Connected workspace sources in this sandbox:",
    ...bootstrap.sources.map(
      (source) =>
        `- ${source.namespace} (${source.kind})${source.connected ? "" : " [connect required]"}`,
    ),
  ];

  return {
    revisionHash: bootstrap.revisionHash,
    sourceCount: bootstrap.sources.length,
    baseUrl: EXECUTOR_BASE_URL,
    homeDirectory,
    instructions: lines.join("\n"),
  };
}
