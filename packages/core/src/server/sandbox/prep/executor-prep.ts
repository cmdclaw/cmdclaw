import {
  getWorkspaceExecutorBootstrap,
  getWorkspaceExecutorNativeMcpOAuthBootstrapSources,
  type WorkspaceExecutorNativeMcpOauthBootstrapSource,
} from "../../executor/workspace-sources";
import { createHash } from "node:crypto";
import type { RuntimeMcpServer, SandboxHandle } from "../core/types";

const EXECUTOR_HOSTNAME = "127.0.0.1";
const EXECUTOR_PORT = 8788;
const EXECUTOR_BASE_URL = `http://${EXECUTOR_HOSTNAME}:${EXECUTOR_PORT}`;
const EXECUTOR_WORKSPACE_ROOT = "/app";
const EXECUTOR_HOME_DIRECTORY = "/tmp/cmdclaw-executor/default";
const EXECUTOR_SCOPE_DIRECTORY = `${EXECUTOR_HOME_DIRECTORY}/scope`;
const EXECUTOR_DATA_DIRECTORY = `${EXECUTOR_HOME_DIRECTORY}/data`;
const EXECUTOR_CONFIG_PATH = `${EXECUTOR_SCOPE_DIRECTORY}/executor.jsonc`;
const EXECUTOR_SERVER_LOG_PATH = "/tmp/cmdclaw-executor-server.log";
const DEFAULT_EXECUTOR_TRACE_SERVICE_NAME = "cmdclaw-sandbox-executor";
const EXECUTOR_OAUTH_CACHE_PATH = "oauth-reconcile-cache.json";
const EXECUTOR_OAUTH_SECRET_CONCURRENCY = 3;
const EXECUTOR_OAUTH_CONFIG_MUTATION_CONCURRENCY = 1;
const EXECUTOR_OAUTH_REFRESH_CONCURRENCY = 3;
const EXECUTOR_SANDBOX_SECRET_PROVIDER = "file";

type LegacyExecutorSourceKind = "mcp" | "openapi";

type LegacyExecutorConfigSource = Record<string, unknown> & {
  kind: LegacyExecutorSourceKind;
  name?: string;
  namespace?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

type LegacyExecutorConfig = {
  workspace?: {
    name?: string;
  };
  sources?: Record<string, LegacyExecutorConfigSource> | unknown[];
};

type ExecutorScopeInfo = {
  id: string;
  name: string;
  dir: string;
};

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

function isStringRecord(
  value: Record<string, unknown> | null | undefined,
): value is Record<string, string> {
  if (!value) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function buildExecutorCommandEnv(homeDirectory: string): Record<string, string> {
  const commandEnv: Record<string, string> = {
    EXECUTOR_HOME: homeDirectory,
    EXECUTOR_SCOPE_DIR: EXECUTOR_SCOPE_DIRECTORY,
    EXECUTOR_DATA_DIR: EXECUTOR_DATA_DIRECTORY,
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

function normalizeMcpRemoteTransport(value: unknown): "streamable-http" | "sse" | "auto" | undefined {
  if (value === "streamable-http" || value === "sse" || value === "auto") {
    return value;
  }

  if (value === "http") {
    return "streamable-http";
  }

  return undefined;
}

function translateLegacyExecutorConfig(configJson: string): string {
  const parsed = parseJsonResult<LegacyExecutorConfig>(configJson, "Executor bootstrap config");
  if (Array.isArray(parsed.sources)) {
    return `${JSON.stringify(parsed, null, 2)}\n`;
  }

  const translatedSources = Object.values(parsed.sources ?? {})
    .filter((source) => source.enabled !== false)
    .map((source) => {
      const name = source.name?.trim() || source.namespace?.trim() || "source";
      const namespace = source.namespace?.trim() || undefined;
      const config = source.config ?? {};

      if (source.kind === "openapi") {
        const spec =
          typeof config.spec === "string"
            ? config.spec
            : typeof config.specUrl === "string"
              ? config.specUrl
              : null;
        if (!spec) {
          throw new Error(`Executor bootstrap source "${name}" is missing an OpenAPI spec URL.`);
        }

        return {
          kind: "openapi" as const,
          spec,
          baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
          namespace,
          headers: isStringRecord(config.defaultHeaders as Record<string, unknown> | null | undefined)
            ? config.defaultHeaders
            : undefined,
        };
      }

      if (typeof config.command === "string" && config.command.trim().length > 0) {
        return {
          kind: "mcp" as const,
          transport: "stdio" as const,
          name,
          command: config.command,
          args: Array.isArray(config.args)
            ? config.args.filter((entry): entry is string => typeof entry === "string")
            : undefined,
          env: isStringRecord(config.env as Record<string, unknown> | null | undefined)
            ? config.env
            : undefined,
          cwd: typeof config.cwd === "string" ? config.cwd : undefined,
          namespace,
        };
      }

      const endpoint = typeof config.endpoint === "string" ? config.endpoint : null;
      if (!endpoint) {
        throw new Error(`Executor bootstrap source "${name}" is missing an MCP endpoint.`);
      }

      return {
        kind: "mcp" as const,
        transport: "remote" as const,
        name,
        endpoint,
        remoteTransport: normalizeMcpRemoteTransport(config.transport),
        namespace,
        queryParams: isStringRecord(config.queryParams as Record<string, unknown> | null | undefined)
          ? config.queryParams
          : undefined,
        headers: isStringRecord(config.headers as Record<string, unknown> | null | undefined)
          ? config.headers
          : undefined,
      };
    });

  return `${JSON.stringify(
    {
      name: parsed.workspace?.name?.trim() || undefined,
      sources: translatedSources,
    },
    null,
    2,
  )}\n`;
}

export type ExecutorSandboxBootstrap = {
  revisionHash: string;
  sourceCount: number;
  baseUrl: string;
  homeDirectory: string;
  instructions: string;
  sessionMcpServers: RuntimeMcpServer[];
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
  const inlineEnv = opts?.env;
  const shouldInlineEnv =
    sandbox.provider === "daytona" && inlineEnv !== undefined && Object.keys(inlineEnv).length > 0;
  const commandWithEnv = shouldInlineEnv
    ? `env ${Object.entries(inlineEnv)
        .map(([key, value]) => `${key}=${escapeShell(value)}`)
        .join(" ")} ${command}`
    : command;
  const execOptions =
    shouldInlineEnv && opts
      ? {
          ...opts,
          env: undefined,
        }
      : opts;

  try {
    return await sandbox.exec(commandWithEnv, execOptions);
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
        namespace: source.namespace,
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

async function executorApiRequestJson<T>(input: {
  sandbox: SandboxHandle;
  env: Record<string, string>;
  method: "GET" | "POST" | "PATCH";
  path: string;
  payload?: unknown;
  timeoutMs?: number;
  label: string;
}): Promise<T> {
  const commandParts = [
    "curl -fsS",
    `-X ${input.method}`,
    escapeShell(`${EXECUTOR_BASE_URL}${input.path}`),
  ];

  if (input.payload !== undefined) {
    commandParts.push("-H 'content-type: application/json'");
    commandParts.push(`--data ${escapeShell(JSON.stringify(input.payload))}`);
  }

  const result = await execNoThrow(input.sandbox, commandParts.join(" "), {
    timeoutMs: input.timeoutMs ?? 15_000,
    env: input.env,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `${input.label} failed (exit=${result.exitCode}): ${
        result.stderr || result.stdout || "unknown error"
      }`,
    );
  }

  return parseJsonResult<T>(result.stdout, input.label);
}

async function getExecutorScopeInfo(input: {
  sandbox: SandboxHandle;
  env: Record<string, string>;
}): Promise<ExecutorScopeInfo> {
  const scopeInfo = await executorApiRequestJson<Partial<ExecutorScopeInfo>>({
    sandbox: input.sandbox,
    env: input.env,
    method: "GET",
    path: "/api/scope",
    timeoutMs: 15_000,
    label: "Executor scope info",
  });

  if (
    !scopeInfo ||
    typeof scopeInfo.id !== "string" ||
    typeof scopeInfo.name !== "string" ||
    typeof scopeInfo.dir !== "string"
  ) {
    throw new Error("Executor scope info response was missing required fields.");
  }

  return {
    id: scopeInfo.id,
    name: scopeInfo.name,
    dir: scopeInfo.dir,
  };
}

function buildExecutorOauthSecretId(
  source: WorkspaceExecutorNativeMcpOauthBootstrapSource,
  kind: "access-token" | "refresh-token",
): string {
  const digest = createHash("sha256")
    .update(`${source.sourceId}:${kind}`)
    .digest("hex")
    .slice(0, 24);

  return `cmdclaw-${kind}-${digest}`;
}

async function upsertExecutorScopedSecret(input: {
  sandbox: SandboxHandle;
  env: Record<string, string>;
  scopeId: string;
  secretId: string;
  name: string;
  value: string;
}): Promise<string> {
  const secret = await executorApiRequestJson<{ id?: string }>({
    sandbox: input.sandbox,
    env: input.env,
    method: "POST",
    path: `/api/scopes/${encodeURIComponent(input.scopeId)}/secrets`,
    payload: {
      id: input.secretId,
      name: input.name,
      value: input.value,
      provider: EXECUTOR_SANDBOX_SECRET_PROVIDER,
    },
    timeoutMs: 15_000,
    label: `Executor secret upsert (${input.secretId})`,
  });

  if (!secret.id) {
    throw new Error(`Executor secret upsert did not return an id for ${input.secretId}.`);
  }

  return secret.id;
}

function buildNativeMcpOauthHeaderAuth(
  source: WorkspaceExecutorNativeMcpOauthBootstrapSource,
  accessTokenSecretId: string,
) {
  if (!source.credential) {
    throw new Error(`Missing OAuth credential for source ${source.sourceId}`);
  }

  const tokenType = source.credential.metadata.tokenType?.trim();
  const normalizedPrefix =
    tokenType && tokenType.length > 0
      ? tokenType.toLowerCase() === "bearer"
        ? "Bearer "
        : `${tokenType} `
      : "Bearer ";
  return {
    kind: "header" as const,
    headerName: "Authorization",
    secretId: accessTokenSecretId,
    prefix: normalizedPrefix,
  };
}

async function reconcileNativeMcpOAuthSourcesInSandbox(input: {
  sandbox: SandboxHandle;
  env: Record<string, string>;
  scopeId: string;
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
      const accessTokenSecretId = buildExecutorOauthSecretId(entry.source, "access-token");
      const refreshTokenSecretId = entry.source.credential?.refreshToken
        ? buildExecutorOauthSecretId(entry.source, "refresh-token")
        : null;

      const accessSecretPromise = upsertExecutorScopedSecret({
        sandbox: input.sandbox,
        env: input.env,
        scopeId: input.scopeId,
        secretId: accessTokenSecretId,
        name: `${entry.source.name} access token`,
        value: entry.source.credential!.accessToken,
      });
      const refreshSecretPromise = refreshTokenSecretId
        ? upsertExecutorScopedSecret({
            sandbox: input.sandbox,
            env: input.env,
            scopeId: input.scopeId,
            secretId: refreshTokenSecretId,
            name: `${entry.source.name} refresh token`,
            value: entry.source.credential!.refreshToken!,
          })
        : Promise.resolve(null);

      const [resolvedAccessTokenSecretId, resolvedRefreshTokenSecretId] = await Promise.all([
        accessSecretPromise,
        refreshSecretPromise,
      ]);

      preparedSources[index] = {
        source: entry.source,
        fingerprint: entry.fingerprint,
        accessTokenSecretId: resolvedAccessTokenSecretId,
        refreshTokenSecretId: resolvedRefreshTokenSecretId,
      };
    },
  );

  await mapWithConcurrency(
    preparedSources,
    EXECUTOR_OAUTH_CONFIG_MUTATION_CONCURRENCY,
    async (entry) => {
      await executorApiRequestJson<{ updated?: boolean }>({
        sandbox: input.sandbox,
        env: input.env,
        method: "PATCH",
        path: `/api/scopes/${encodeURIComponent(input.scopeId)}/mcp/sources/${encodeURIComponent(entry.source.namespace)}`,
        payload: {
          auth: buildNativeMcpOauthHeaderAuth(entry.source, entry.accessTokenSecretId),
        },
        timeoutMs: 30_000,
        label: `Executor MCP source update (${entry.source.namespace})`,
      });
    },
  );

  await mapWithConcurrency(
    preparedSources,
    EXECUTOR_OAUTH_REFRESH_CONCURRENCY,
    async (entry) => {
      await executorApiRequestJson<{ toolCount?: number }>({
        sandbox: input.sandbox,
        env: input.env,
        method: "POST",
        path: `/api/scopes/${encodeURIComponent(input.scopeId)}/mcp/sources/refresh`,
        payload: {
          namespace: entry.source.namespace,
        },
        timeoutMs: 30_000,
        label: `Executor MCP source refresh (${entry.source.namespace})`,
      });
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
}): Promise<ExecutorScopeInfo> {
  const translatedConfigJson = translateLegacyExecutorConfig(input.configJson);

  await input.runPhase("config_write", async () => {
    await input.sandbox.ensureDir(EXECUTOR_HOME_DIRECTORY);
    await input.sandbox.ensureDir(EXECUTOR_SCOPE_DIRECTORY);
    await input.sandbox.ensureDir(EXECUTOR_DATA_DIRECTORY);
    await input.sandbox.writeFile(EXECUTOR_CONFIG_PATH, translatedConfigJson);
    await input.sandbox.writeFile(
      `${EXECUTOR_HOME_DIRECTORY}/workspace-state.json`,
      input.workspaceStateJson,
    );
  });

  const serverReadyResult = await input.runPhase("server_probe", async () =>
    await execNoThrow(
      input.sandbox,
      `curl -fsS ${escapeShell(`${EXECUTOR_BASE_URL}/api/scope`)} >/dev/null`,
      {
        timeoutMs: 5_000,
        env: input.env,
      },
    ),
  );

  const restartCommand = [
    `executor daemon stop --base-url ${EXECUTOR_BASE_URL} >/dev/null 2>&1 || true`,
    `rm -f ${EXECUTOR_SERVER_LOG_PATH}`,
    `nohup executor daemon run --hostname ${EXECUTOR_HOSTNAME} --port ${EXECUTOR_PORT} >${EXECUTOR_SERVER_LOG_PATH} 2>&1 </dev/null &`,
  ].join("; ");

  const restartResult = await input.runPhase("server_wait_ready", async () =>
    await execNoThrow(input.sandbox, `bash -lc ${escapeShell(restartCommand)}`, {
      timeoutMs: 15_000,
      env: input.env,
    }),
  );

  if (restartResult.exitCode !== 0) {
    throw new Error(
      `Executor daemon restart failed (exit=${restartResult.exitCode}): ${
        restartResult.stderr || restartResult.stdout || "unknown error"
      }`,
    );
  }

  const waitCommand = [
    "for _ in $(seq 1 30); do",
    `curl -fsS ${EXECUTOR_BASE_URL}/api/scope >/dev/null 2>&1 && exit 0;`,
    "sleep 1;",
    "done;",
    `echo "executor daemon did not become ready; see ${EXECUTOR_SERVER_LOG_PATH}" >&2;`,
    `tail -n 40 ${EXECUTOR_SERVER_LOG_PATH} >&2 || true;`,
    "exit 1",
  ].join(" ");

  const waitResult = await execNoThrow(input.sandbox, `bash -lc ${escapeShell(waitCommand)}`, {
    timeoutMs: 45_000,
    env: input.env,
  });

  if (waitResult.exitCode !== 0) {
    const diagnosticResult = await execNoThrow(
      input.sandbox,
      `bash -lc ${escapeShell(
        [
          "echo '--- executor-command ---'",
          "command -v executor || true",
          "echo '--- executor-env ---'",
          "env | sort | grep -E '^(HOME|PATH|USER|EXECUTOR_HOME|EXECUTOR_SCOPE_DIR|EXECUTOR_DATA_DIR)=' || true",
          "echo '--- executor-log ---'",
          `cat ${EXECUTOR_SERVER_LOG_PATH} 2>/dev/null || true`,
        ].join("; "),
      )}`,
      {
        timeoutMs: 5_000,
        env: input.env,
      },
    );
    const details = [
      waitResult.stderr || waitResult.stdout || serverReadyResult.stderr || serverReadyResult.stdout,
      diagnosticResult.stderr || diagnosticResult.stdout,
    ]
      .filter((value) => Boolean(value))
      .join("\n");
    throw new Error(
      `Executor bootstrap failed (exit=${waitResult.exitCode}): ${details || "unknown error"}`,
    );
  }

  return await input.runPhase("status_check", async () =>
    await getExecutorScopeInfo({
      sandbox: input.sandbox,
      env: input.env,
    }),
  );
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
  if (Array.isArray(input.allowedSourceIds) && input.allowedSourceIds.length === 0) {
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

  const homeDirectory = EXECUTOR_HOME_DIRECTORY;
  const executorCommandEnv = buildExecutorCommandEnv(homeDirectory);
  const scopeInfo = await ensureExecutorServerReady({
    sandbox: input.sandbox,
    configJson: bootstrap.configJson,
    workspaceStateJson: bootstrap.workspaceStateJson,
    env: executorCommandEnv,
    runPhase,
  });

  const lines = [
    "## Executor Runtime",
    "CmdClaw prepared a sandbox-local Executor daemon for shared workspace sources.",
    `Executor workspace root: \`${EXECUTOR_WORKSPACE_ROOT}\``,
    `Executor base URL: \`${EXECUTOR_BASE_URL}\``,
    `Executor home: \`${homeDirectory}\``,
    `Executor scope dir: \`${EXECUTOR_SCOPE_DIRECTORY}\``,
    `Executor scope id: \`${scopeInfo.id}\``,
    "CmdClaw owns `executor.jsonc`; do not hand-edit it while the daemon is running.",
    "Useful commands:",
    `- \`curl -fsS ${EXECUTOR_BASE_URL}/api/scope\``,
    `- \`EXECUTOR_HOME=${homeDirectory} EXECUTOR_SCOPE_DIR=${EXECUTOR_SCOPE_DIRECTORY} EXECUTOR_DATA_DIR=${EXECUTOR_DATA_DIRECTORY} executor tools sources --base-url ${EXECUTOR_BASE_URL}\``,
    `- \`EXECUTOR_HOME=${homeDirectory} EXECUTOR_SCOPE_DIR=${EXECUTOR_SCOPE_DIRECTORY} EXECUTOR_DATA_DIR=${EXECUTOR_DATA_DIRECTORY} executor tools search "latest linear issues" --base-url ${EXECUTOR_BASE_URL}\``,
    "OpenCode still reaches Executor through the local MCP command `executor mcp`.",
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
        scopeId: scopeInfo.id,
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
    sessionMcpServers: [
      {
        type: "stdio",
        name: "executor",
        command: "executor",
        args: ["mcp"],
        env: Object.entries(executorCommandEnv).map(([name, value]) => ({
          name,
          value,
        })),
      },
    ],
    finalize,
  };
}
