import type { SandboxHandle } from "../core/types";
import {
  getIntegrationSkillsSystemPrompt as getIntegrationSkillsSystemPromptLegacy,
  getSkillsSystemPrompt as getSkillsSystemPromptLegacy,
  writeResolvedIntegrationSkillsToSandbox as writeResolvedIntegrationSkillsToSandboxLegacy,
  writeSkillsToSandbox as writeSkillsToSandboxLegacy,
} from "../opencode-session";

function toLegacySandbox(sandbox: SandboxHandle) {
  const legacyProvider = sandbox.provider === "daytona" ? "daytona" : "e2b";

  return {
    provider: legacyProvider,
    sandboxId: sandbox.sandboxId,
    commands: {
      run: async (command: string, opts?: { timeoutMs?: number; envs?: Record<string, string> }) =>
        sandbox.exec(command, {
          timeoutMs: opts?.timeoutMs,
          env: opts?.envs,
        }),
    },
    files: {
      write: async (path: string, content: string | ArrayBuffer) =>
        sandbox.writeFile(path, content),
      read: async (path: string) => sandbox.readFile(path),
    },
  };
}

export async function writeSkillsToSandbox(
  sandbox: SandboxHandle,
  userId: string,
): Promise<string[]> {
  return writeSkillsToSandboxLegacy(toLegacySandbox(sandbox) as never, userId);
}

export async function writeResolvedIntegrationSkillsToSandbox(
  sandbox: SandboxHandle,
  userId: string,
  allowedSlugs?: string[],
): Promise<string[]> {
  return writeResolvedIntegrationSkillsToSandboxLegacy(
    toLegacySandbox(sandbox) as never,
    userId,
    allowedSlugs,
  );
}

export const getSkillsSystemPrompt = getSkillsSystemPromptLegacy;
export const getIntegrationSkillsSystemPrompt = getIntegrationSkillsSystemPromptLegacy;
