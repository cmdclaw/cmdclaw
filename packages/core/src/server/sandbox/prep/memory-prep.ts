import type { SandboxHandle } from "../core/types";
import { buildMemorySystemPrompt, syncMemoryToSandbox } from "../../services/memory-service";

export { buildMemorySystemPrompt };

export async function syncMemoryFilesToSandbox(
  userId: string,
  sandbox: SandboxHandle,
): Promise<void> {
  await syncMemoryToSandbox(
    userId,
    async (path, content) => {
      await sandbox.writeFile(path, content);
    },
    async (dir) => {
      await sandbox.ensureDir(dir);
    },
  );
}
