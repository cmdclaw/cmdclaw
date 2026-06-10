import type { Message, SandboxFileData } from "./message-list";

type DoneArtifactsForAgenticApp = {
  sandboxFiles?: SandboxFileData[];
};

type LatestAgenticAppInput =
  | Message[]
  | {
      messages?: Message[];
      persistedSandboxFiles?: SandboxFileData[];
      doneArtifacts?: DoneArtifactsForAgenticApp | null;
    };

export function isAgenticAppSandboxFile(file: SandboxFileData): boolean {
  return file.filename === "output.html";
}

function findLatestAgenticAppFromFiles(
  files: SandboxFileData[] | undefined,
): SandboxFileData | null {
  for (let fileIndex = (files?.length ?? 0) - 1; fileIndex >= 0; fileIndex -= 1) {
    const file = files?.[fileIndex];
    if (file && isAgenticAppSandboxFile(file)) {
      return file;
    }
  }

  return null;
}

export function findLatestAgenticAppFile(input: LatestAgenticAppInput): SandboxFileData | null {
  if (!Array.isArray(input)) {
    const doneArtifactFile = findLatestAgenticAppFromFiles(input.doneArtifacts?.sandboxFiles);
    if (doneArtifactFile) {
      return doneArtifactFile;
    }

    const persistedFile = findLatestAgenticAppFromFiles(input.persistedSandboxFiles);
    if (persistedFile) {
      return persistedFile;
    }
  }

  const messages = Array.isArray(input) ? input : (input.messages ?? []);
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const file = findLatestAgenticAppFromFiles(messages[messageIndex]?.sandboxFiles);
    if (file) {
      return file;
    }
  }

  return null;
}
