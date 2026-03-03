import type {
  ConversationRuntimeContext,
  ConversationRuntimeOptions,
  ConversationRuntimeResult,
  RuntimeSelection,
  SandboxHandle,
} from "@/server/sandbox/core/types";
import { createRuntimeHarnessClientFromOpencodeClient } from "@/server/sandbox/compat/opencode-client-shim";
import {
  getOrCreateSession,
  type OpenCodeSandbox,
  type OpenCodeSessionConfig,
} from "@/server/sandbox/opencode-session";

function toSandboxHandle(sandbox: OpenCodeSandbox): SandboxHandle {
  return {
    provider: sandbox.provider,
    sandboxId: sandbox.sandboxId,
    exec: async (command, opts) =>
      sandbox.commands.run(command, {
        timeoutMs: opts?.timeoutMs,
        envs: opts?.env,
        background: opts?.background,
        onStderr: opts?.onStderr,
      }),
    writeFile: async (path, content) => sandbox.files.write(path, content),
    readFile: async (path) => sandbox.files.read(path),
    ensureDir: async (path) => {
      await sandbox.commands.run(`mkdir -p "${path}"`);
    },
  };
}

export async function runConversationSessionPipeline(input: {
  context: ConversationRuntimeContext;
  selection: RuntimeSelection;
  options?: ConversationRuntimeOptions;
}): Promise<ConversationRuntimeResult> {
  const config: OpenCodeSessionConfig = {
    conversationId: input.context.conversationId,
    generationId: input.context.generationId,
    userId: input.context.userId,
    anthropicApiKey: input.context.anthropicApiKey,
    integrationEnvs: input.context.integrationEnvs,
  };

  const result = await getOrCreateSession(config, {
    title: input.options?.title,
    replayHistory: input.options?.replayHistory,
    onLifecycle: input.options?.onLifecycle,
    telemetry: input.options?.telemetry,
  });

  return {
    sandbox: toSandboxHandle(result.sandbox),
    harnessClient: createRuntimeHarnessClientFromOpencodeClient(result.client),
    session: { id: result.sessionId },
    metadata: {
      sandboxProvider: result.sandbox.provider,
      runtimeHarness: input.selection.runtimeHarness,
      runtimeProtocolVersion: input.selection.runtimeProtocolVersion,
    },
  };
}
