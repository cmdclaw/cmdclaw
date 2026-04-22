import {
  getWorkspaceExecutorBootstrap,
  getWorkspaceExecutorNativeMcpOAuthBootstrapSources,
  type WorkspaceExecutorNativeMcpOauthBootstrapSource,
} from "../../executor/workspace-sources";
import { createHash } from "node:crypto";
import type { SandboxHandle } from "../core/types";

const EXECUTOR_BASE_URL = "http://127.0.0.1:8788";
const EXECUTOR_WORKSPACE_ROOT = "/app";
const EXECUTOR_SERVER_LOG_PATH = "/tmp/cmdclaw-executor-server.log";
const DEFAULT_EXECUTOR_TRACE_SERVICE_NAME = "cmdclaw-sandbox-executor";
const EXECUTOR_OAUTH_CACHE_PATH = "oauth-reconcile-cache.json";
const EXECUTOR_OAUTH_SECRET_CONCURRENCY = 3;
// `updateSource` mutates the shared executor.jsonc file under a single EXECUTOR_HOME.
// Running those updates concurrently can leave the config truncated or otherwise corrupted.
const EXECUTOR_OAUTH_CONFIG_MUTATION_CONCURRENCY = 1;
const EXECUTOR_OAUTH_REFRESH_CONCURRENCY = 3;

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

export type ExecutorSandboxPreparation = ExecutorSandboxBootstrap & {
  finalize: () => Promise<{ oauthCacheHits: number }>;
};

export type ExecutorPreparePhase =
  | "bootstrap_load"
  | "config_write"
  | "server_probe"
  | "server_wait_ready"
  | "status_check"
  | "oauth_reconcile";

type ExecutorOauthCacheRecord = {
  version: 1;
  sources: Record<string, string>;
};

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

function executorOauthCacheFilePath(homeDirectory: string): string {
  return `${homeDirectory}/${EXECUTOR_OAUTH_CACHE_PATH}`;
}

function fingerprintOauthSource(source: WorkspaceExecutorNativeMcpOauthBootstrapSource): string | null {
  if (!source.credential) {
    return null;
  }

  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceId: source.sourceId,
        endpoint: source.endpoint,
        transport: source.transport,
        queryParams: source.queryParams,
        accessToken: source.credential.accessToken,
        refreshToken: source.credential.refreshToken ?? null,
        expiresAt: source.credential.expiresAt?.toISOString() ?? null,
        metadata: source.credential.metadata,
      }),
    )
    .digest("hex");
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      await worker(items[current] as T, current);
    }
  });

  await Promise.all(runners);
}

async function readExecutorOauthCache(
  sandbox: SandboxHandle,
  homeDirectory: string,
): Promise<ExecutorOauthCacheRecord | null> {
  try {
    const raw = await sandbox.readFile(executorOauthCacheFilePath(homeDirectory));
    const parsed = JSON.parse(String(raw)) as Partial<ExecutorOauthCacheRecord>;
    if (!parsed || parsed.version !== 1 || typeof parsed.sources !== "object" || !parsed.sources) {
      return null;
    }

    return {
      version: 1,
      sources: Object.fromEntries(
        Object.entries(parsed.sources).filter(
          (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
        ),
      ),
    };
  } catch {
    return null;
  }
}

async function writeExecutorOauthCache(input: {
  sandbox: SandboxHandle;
  homeDirectory: string;
  cache: ExecutorOauthCacheRecord;
}): Promise<void> {
  await input.sandbox.ensureDir(input.homeDirectory);
  await input.sandbox.writeFile(
    executorOauthCacheFilePath(input.homeDirectory),
    JSON.stringify(input.cache, null, 2),
  );
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
  homeDirectory: string;
  reuseExistingState?: boolean;
}): Promise<{ cacheHits: number }> {
  const existingCache = input.reuseExistingState
    ? await readExecutorOauthCache(input.sandbox, input.homeDirectory)
    : null;
  const nextCache: ExecutorOauthCacheRecord = {
    version: 1,
    sources: { ...(existingCache?.sources ?? {}) },
  };

  const pendingSources = input.sources
    .map((source) => ({
      source,
      fingerprint: fingerprintOauthSource(source),
    }))
    .filter(
      (entry): entry is {
        source: WorkspaceExecutorNativeMcpOauthBootstrapSource;
        fingerprint: string;
      } => Boolean(entry.source.credential && entry.fingerprint),
    );

  let cacheHits = 0;
  const sourcesToReconcile = pendingSources.filter((entry) => {
    const cachedFingerprint = existingCache?.sources[entry.source.sourceId];
    if (input.reuseExistingState && cachedFingerprint === entry.fingerprint) {
      cacheHits += 1;
      return false;
    }
    return true;
  });

  type PreparedSource = {
    source: WorkspaceExecutorNativeMcpOauthBootstrapSource;
    fingerprint: string;
    accessTokenSecretId: string;
    refreshTokenSecretId: string | null;
  };
  const preparedSources: PreparedSource[] = new Array(sourcesToReconcile.length);

  await mapWithConcurrency(
    sourcesToReconcile,
    EXECUTOR_OAUTH_SECRET_CONCURRENCY,
    async (entry, index) => {
      const accessSecretPromise = createExecutorLocalSecret({
        sandbox: input.sandbox,
        env: input.env,
        name: `${entry.source.name} access token`,
        value: entry.source.credential!.accessToken,
      });
      const refreshSecretPromise = entry.source.credential!.refreshToken
        ? createExecutorLocalSecret({
            sandbox: input.sandbox,
            env: input.env,
            name: `${entry.source.name} refresh token`,
            value: entry.source.credential!.refreshToken,
          })
        : Promise.resolve(null);

      const [accessTokenSecretId, refreshTokenSecretId] = await Promise.all([
        accessSecretPromise,
        refreshSecretPromise,
      ]);

      preparedSources[index] = {
        source: entry.source,
        fingerprint: entry.fingerprint,
        accessTokenSecretId,
        refreshTokenSecretId,
      };
    },
  );

  await mapWithConcurrency(
    preparedSources,
    EXECUTOR_OAUTH_CONFIG_MUTATION_CONCURRENCY,
    async (entry) => {
      const updateCode = `return await tools.executor.mcp.updateSource(${JSON.stringify({
        sourceId: entry.source.sourceId,
        config: buildNativeMcpOauthSourceConfig(
          entry.source,
          entry.accessTokenSecretId,
          entry.refreshTokenSecretId,
        ),
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
          `Executor MCP native update failed for ${entry.source.sourceId} (exit=${updateResult.exitCode}): ${
            updateResult.stderr || updateResult.stdout || "unknown error"
          }`,
        );
      }
    },
  );

  await mapWithConcurrency(
    preparedSources,
    EXECUTOR_OAUTH_REFRESH_CONCURRENCY,
    async (entry) => {
      const refreshCode = `return await tools.executor.sources.refresh(${JSON.stringify({
        sourceId: entry.source.sourceId,
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
          `Executor source refresh failed for ${entry.source.sourceId} (exit=${refreshResult.exitCode}): ${
            refreshResult.stderr || refreshResult.stdout || "unknown error"
          }`,
        );
      }
      nextCache.sources[entry.source.sourceId] = entry.fingerprint;
    },
  );

  if (Object.keys(nextCache.sources).length > 0) {
    await writeExecutorOauthCache({
      sandbox: input.sandbox,
      homeDirectory: input.homeDirectory,
      cache: nextCache,
    });
  }

  return { cacheHits };
}

async function loadExecutorBootstrap(input: {
  workspaceId: string;
  workspaceName?: string | null;
  userId: string;
  allowedSourceIds?: string[] | null;
  runPhase: <T>(phase: ExecutorPreparePhase, action: () => Promise<T>) => Promise<T>;
}) {
  return input.runPhase("bootstrap_load", async () =>
    await Promise.all([
      getWorkspaceExecutorBootstrap({
        workspaceId: input.workspaceId,
        workspaceName: input.workspaceName,
        userId: input.userId,
        allowedSourceIds: input.allowedSourceIds,
      }),
      getWorkspaceExecutorNativeMcpOAuthBootstrapSources({
        workspaceId: input.workspaceId,
        userId: input.userId,
        allowedSourceIds: input.allowedSourceIds,
      }),
    ]),
  );
}

async function ensureExecutorServerReady(input: {
  sandbox: SandboxHandle;
  configJson: string;
  workspaceStateJson: string;
  env: Record<string, string>;
  runPhase: <T>(phase: ExecutorPreparePhase, action: () => Promise<T>) => Promise<T>;
}) {
  await input.runPhase("config_write", async () => {
    await input.sandbox.ensureDir("/app/.executor/state");
    await input.sandbox.writeFile("/app/.executor/executor.jsonc", input.configJson);
    await input.sandbox.writeFile("/app/.executor/state/workspace-state.json", input.workspaceStateJson);
  });

  const serverReadyResult = await input.runPhase("server_probe", async () =>
    await execNoThrow(
      input.sandbox,
      `curl -fsS ${escapeShell(`${EXECUTOR_BASE_URL}/`)} >/dev/null`,
      {
        timeoutMs: 5_000,
        env: input.env,
      },
    ),
  );

  const waitCommand = [
    "for _ in $(seq 1 30); do",
    `curl -fsS ${escapeShell(`${EXECUTOR_BASE_URL}/`)} >/dev/null 2>&1 && exit 0;`,
    "sleep 1;",
    "done;",
    `echo ${escapeShell(`executor server did not become ready; see ${EXECUTOR_SERVER_LOG_PATH}`)} >&2;`,
    `tail -n 40 ${escapeShell(EXECUTOR_SERVER_LOG_PATH)} >&2 || true;`,
    "exit 1",
  ].join(" ");

  const waitResult = await input.runPhase("server_wait_ready", async () =>
    await execNoThrow(input.sandbox, `bash -lc ${escapeShell(waitCommand)}`, {
      timeoutMs: 45_000,
      env: input.env,
    }),
  );

  if (waitResult.exitCode !== 0) {
    const details =
      serverReadyResult.stderr || serverReadyResult.stdout || waitResult.stderr || waitResult.stdout;
    throw new Error(
      `Executor bootstrap failed (exit=${waitResult.exitCode}): ${details || "unknown error"}`,
    );
  }

  const statusResult = await input.runPhase("status_check", async () =>
    await execNoThrow(
      input.sandbox,
      `executor call --base-url ${escapeShell(EXECUTOR_BASE_URL)} --no-open ${escapeShell(
        'return "ok"',
      )}`,
      {
        timeoutMs: 15_000,
        env: input.env,
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
}

export async function prepareExecutorInSandbox(input: {
  sandbox: SandboxHandle;
  workspaceId: string | null | undefined;
  workspaceName?: string | null;
  userId: string;
  allowedSourceIds?: string[] | null;
  runtimeId?: string | null;
  reuseExistingState?: boolean;
  onPhase?: (phase: ExecutorPreparePhase, status: "started" | "completed") => void;
}): Promise<ExecutorSandboxPreparation | null> {
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

  const [bootstrap, nativeMcpOauthSources] = await loadExecutorBootstrap({
    workspaceId,
    workspaceName: input.workspaceName,
    userId: input.userId,
    allowedSourceIds: input.allowedSourceIds,
    runPhase,
  });

  if (bootstrap.sources.length === 0) {
    return null;
  }

  const homeDirectory = input.runtimeId
    ? `/tmp/cmdclaw-executor/${input.runtimeId}`
    : "/tmp/cmdclaw-executor/default";
  const executorCommandEnv = buildExecutorCommandEnv(homeDirectory);

  await ensureExecutorServerReady({
    sandbox: input.sandbox,
    configJson: bootstrap.configJson,
    workspaceStateJson: bootstrap.workspaceStateJson,
    env: executorCommandEnv,
    runPhase,
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
    `- \`EXECUTOR_HOME=${homeDirectory} executor call --base-url ${EXECUTOR_BASE_URL} --no-open 'return await tools.discover({ query: \"available tools\", limit: 20 });'\``,
    "Inside executor code, use the discovery workflow and call `tools.*` APIs rather than raw fetch.",
    "Connected workspace sources in this sandbox:",
    ...bootstrap.sources.map(
      (source) =>
        `- ${source.namespace} (${source.kind})${source.connected ? "" : " [connect required]"}`,
    ),
  ];

  const finalize = async () =>
    await runPhase("oauth_reconcile", async () => {
      const oauthReconcile = await reconcileNativeMcpOAuthSourcesInSandbox({
        sandbox: input.sandbox,
        env: executorCommandEnv,
        sources: nativeMcpOauthSources,
        homeDirectory,
        reuseExistingState: input.reuseExistingState,
      });

      return {
        oauthCacheHits: oauthReconcile.cacheHits,
      };
    });

  return {
    revisionHash: bootstrap.revisionHash,
    sourceCount: bootstrap.sources.length,
    baseUrl: EXECUTOR_BASE_URL,
    homeDirectory,
    instructions: lines.join("\n"),
    finalize,
  };
}
