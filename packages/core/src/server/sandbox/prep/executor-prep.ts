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
    `export EXECUTOR_HOME=${escapeShell(homeDirectory)}`,
    `cd ${escapeShell(EXECUTOR_WORKSPACE_ROOT)}`,
    `if executor status --base-url ${escapeShell(EXECUTOR_BASE_URL)} --json >/tmp/cmdclaw-executor-status.json 2>/dev/null; then exit 0; fi`,
    `nohup executor up --base-url ${escapeShell(EXECUTOR_BASE_URL)} >/tmp/cmdclaw-executor.log 2>&1 &`,
    "for i in $(seq 1 60); do",
    `  if executor status --base-url ${escapeShell(EXECUTOR_BASE_URL)} --json >/tmp/cmdclaw-executor-status.json 2>/dev/null; then exit 0; fi`,
    "  sleep 0.5",
    "done",
    'cat /tmp/cmdclaw-executor.log >&2 || true',
    'echo "executor failed to become ready" >&2',
    "exit 1",
  ].join("\n");

  const startResult = await input.sandbox.exec(`bash -lc ${escapeShell(startCommand)}`, {
    timeoutMs: 45_000,
  });

  if (startResult.exitCode !== 0) {
    throw new Error(
      `Executor bootstrap failed (exit=${startResult.exitCode}): ${
        startResult.stderr || startResult.stdout || "unknown error"
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
