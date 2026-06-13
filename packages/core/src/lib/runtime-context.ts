export const BAP_RUNTIME_CONTEXT_PATH = "/tmp/bap-runtime-context.json";

export type RuntimeContextFile = {
  runtimeId: string;
  turnSeq: number;
  callbackToken: string;
  updatedAt: string;
};
