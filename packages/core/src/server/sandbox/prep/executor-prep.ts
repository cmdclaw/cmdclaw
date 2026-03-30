import { getWorkspaceExecutorBootstrap } from "../../executor/workspace-sources";
import type { SandboxHandle } from "../core/types";

const EXECUTOR_BASE_URL = "http://127.0.0.1:8788";
const EXECUTOR_WORKSPACE_ROOT = "/app";

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

type ExecutorStatus = {
  reachable?: boolean;
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

function parseExecutorStatus(raw: string): ExecutorStatus | null {
  try {
    return JSON.parse(raw) as ExecutorStatus;
  } catch {
    return null;
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

  const startCommand = [
    "set -euo pipefail",
    `cd ${escapeShell(EXECUTOR_WORKSPACE_ROOT)}`,
    `executor up --base-url ${escapeShell(EXECUTOR_BASE_URL)}`,
  ].join("\n");

  const startResult = await execNoThrow(input.sandbox, `bash -lc ${escapeShell(startCommand)}`, {
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
    `executor status --base-url ${escapeShell(EXECUTOR_BASE_URL)} --json`,
    {
      timeoutMs: 15_000,
      env: {
        EXECUTOR_HOME: homeDirectory,
      },
    },
  );

  const parsedStatus = parseExecutorStatus(statusResult.stdout);
  if (statusResult.exitCode !== 0 || !parsedStatus?.reachable) {
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
    "Use executor through the local daemon instead of editing `.executor` files manually.",
    "Useful commands:",
    `- \`EXECUTOR_HOME=${homeDirectory} executor status --base-url ${EXECUTOR_BASE_URL} --json\``,
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
