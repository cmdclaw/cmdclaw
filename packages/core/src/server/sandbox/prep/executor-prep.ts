import { getWorkspaceExecutorBootstrap } from "../../executor/workspace-sources";
import type { SandboxHandle } from "../core/types";

const EXECUTOR_BASE_URL = "http://127.0.0.1:8788";
const EXECUTOR_WORKSPACE_ROOT = "/app";
const EXECUTOR_SERVER_PORT = 8788;
const EXECUTOR_SERVER_LOG_PATH = "/tmp/cmdclaw-executor-server.log";

function escapeShell(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export type ExecutorSandboxBootstrap = {
  revisionHash: string;
  sourceCount: number;
  baseUrl: string;
  homeDirectory: string;
  instructions: string;
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

export async function prepareExecutorInSandbox(input: {
  sandbox: SandboxHandle;
  workspaceId: string | null | undefined;
  workspaceName?: string | null;
  userId: string;
  allowedSourceIds?: string[] | null;
  runtimeId?: string | null;
}): Promise<ExecutorSandboxBootstrap | null> {
  if (!input.workspaceId) {
    return null;
  }

  const bootstrap = await getWorkspaceExecutorBootstrap({
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    userId: input.userId,
    allowedSourceIds: input.allowedSourceIds,
  });

  if (bootstrap.sources.length === 0) {
    return null;
  }

  const homeDirectory = input.runtimeId
    ? `/tmp/cmdclaw-executor/${input.runtimeId}`
    : "/tmp/cmdclaw-executor/default";

  await input.sandbox.ensureDir("/app/.executor/state");
  await input.sandbox.writeFile("/app/.executor/executor.jsonc", bootstrap.configJson);
  await input.sandbox.writeFile(
    "/app/.executor/state/workspace-state.json",
    bootstrap.workspaceStateJson,
  );

  const serverReadyResult = await execNoThrow(
    input.sandbox,
    `curl -fsS ${escapeShell(`${EXECUTOR_BASE_URL}/`)} >/dev/null`,
    {
      timeoutMs: 5_000,
      env: {
        EXECUTOR_HOME: homeDirectory,
      },
    },
  );

  if (serverReadyResult.exitCode !== 0) {
    const startResult = await execNoThrow(
      input.sandbox,
      `cd ${escapeShell(EXECUTOR_WORKSPACE_ROOT)} && executor server start --port ${EXECUTOR_SERVER_PORT} >${escapeShell(
        EXECUTOR_SERVER_LOG_PATH,
      )} 2>&1`,
      {
        timeoutMs: 0,
        background: true,
        env: {
          EXECUTOR_HOME: homeDirectory,
        },
      },
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

  const startResult = await execNoThrow(input.sandbox, `bash -lc ${escapeShell(waitCommand)}`, {
    timeoutMs: 45_000,
    env: {
      EXECUTOR_HOME: homeDirectory,
    },
  });

  if (startResult.exitCode !== 0) {
    throw new Error(
      `Executor bootstrap failed (exit=${startResult.exitCode}): ${
        startResult.stderr || startResult.stdout || "unknown error"
      }`,
    );
  }

  const statusResult = await execNoThrow(
    input.sandbox,
    `executor call --base-url ${escapeShell(EXECUTOR_BASE_URL)} --no-open ${escapeShell(
      'return "ok"',
    )}`,
    {
      timeoutMs: 15_000,
      env: {
        EXECUTOR_HOME: homeDirectory,
      },
    },
  );

  if (statusResult.exitCode !== 0) {
    throw new Error(
      `Executor status check failed (exit=${statusResult.exitCode}): ${
        statusResult.stderr || statusResult.stdout || "unknown error"
      }`,
    );
  }

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
