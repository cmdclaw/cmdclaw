import type {
  ConversationRuntimeAgentInitResult,
  ConversationRuntimeContext,
  ConversationRuntimeOptions,
  ConversationRuntimeResult,
  ConversationRuntimeSandboxInitResult,
  RuntimeSelection,
  SandboxHandle,
} from "./types";
import { createRuntimeHarnessClientFromOpencodeClient } from "../compat/opencode-client-shim";
import {
  completeSessionInitForCloudProvider,
  getOrCreateSandboxForCloudProvider,
  type OpenCodeSandbox,
  type OpenCodeSessionConfig,
} from "../opencode-session";

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
  const sandboxInit = await runConversationSandboxPipeline(input);
  const agentInit = await sandboxInit.completeAgentInit();

  return {
    sandbox: sandboxInit.sandbox,
    metadata: sandboxInit.metadata,
    harnessClient: agentInit.harnessClient,
    session: agentInit.session,
    sessionSource: agentInit.sessionSource,
  };
}

export async function runConversationSandboxPipeline(input: {
  context: ConversationRuntimeContext;
  selection: RuntimeSelection;
  options?: ConversationRuntimeOptions;
}): Promise<ConversationRuntimeSandboxInitResult> {
  const config: OpenCodeSessionConfig = {
    conversationId: input.context.conversationId,
    generationId: input.context.generationId,
    userId: input.context.userId,
    model: input.context.model,
    anthropicApiKey: input.context.anthropicApiKey,
    integrationEnvs: input.context.integrationEnvs,
    openAIAuthSource: input.context.openAIAuthSource,
  };

  const result = await getOrCreateSandboxForCloudProvider(
    input.selection.sandboxProvider,
    config,
    {
      title: input.options?.title,
      replayHistory: input.options?.replayHistory,
      allowSnapshotRestore: input.options?.allowSnapshotRestore,
      onLifecycle: input.options?.onLifecycle,
      telemetry: input.options?.telemetry,
    },
  );

  return {
    sandbox: toSandboxHandle(result.sandbox),
    metadata: {
      sandboxProvider: result.sandbox.provider,
      runtimeHarness: input.selection.runtimeHarness,
      runtimeProtocolVersion: input.selection.runtimeProtocolVersion,
    },
    completeAgentInit: async (): Promise<ConversationRuntimeAgentInitResult> => {
      const agentResult = await completeSessionInitForCloudProvider(
        input.selection.sandboxProvider,
        result,
        config,
        {
          title: input.options?.title,
          replayHistory: input.options?.replayHistory,
          allowSnapshotRestore: input.options?.allowSnapshotRestore,
          onLifecycle: input.options?.onLifecycle,
          telemetry: input.options?.telemetry,
        },
      );

      return {
        harnessClient: createRuntimeHarnessClientFromOpencodeClient(agentResult.client),
        session: { id: agentResult.sessionId },
        sessionSource: agentResult.sessionSource,
      };
    },
  };
}
