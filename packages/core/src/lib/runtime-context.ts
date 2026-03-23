export const CMDCLAW_RUNTIME_CONTEXT_PATH = "/tmp/cmdclaw-runtime-context.json";

export type RuntimeContextFile = {
  runtimeId: string;
  turnSeq: number;
  callbackToken: string;
  updatedAt: string;
};
