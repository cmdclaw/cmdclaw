import { readFile } from "node:fs/promises";

const BAP_RUNTIME_CONTEXT_PATH = "/tmp/bap-runtime-context.json";

export interface RuntimeContextFile {
  runtimeId: string;
  turnSeq: number;
  callbackToken: string;
  updatedAt: string;
}

export async function readRuntimeContext(): Promise<RuntimeContextFile> {
  const raw = await readFile(BAP_RUNTIME_CONTEXT_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<RuntimeContextFile>;

  if (
    typeof parsed.runtimeId !== "string" ||
    parsed.runtimeId.trim().length === 0 ||
    typeof parsed.callbackToken !== "string" ||
    parsed.callbackToken.trim().length === 0 ||
    typeof parsed.turnSeq !== "number" ||
    !Number.isInteger(parsed.turnSeq) ||
    parsed.turnSeq <= 0
  ) {
    throw new Error(`Invalid runtime context file at ${BAP_RUNTIME_CONTEXT_PATH}`);
  }

  return {
    runtimeId: parsed.runtimeId,
    turnSeq: parsed.turnSeq,
    callbackToken: parsed.callbackToken,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
  };
}
