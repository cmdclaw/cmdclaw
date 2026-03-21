export const START_GENERATION_ERROR_CODES = {
  ACTIVE_GENERATION_EXISTS: "active_generation_exists",
  CONVERSATION_NOT_FOUND: "conversation_not_found",
  ACCESS_DENIED: "access_denied",
  MODEL_ACCESS_DENIED: "model_access_denied",
} as const;

export type StartGenerationErrorCode =
  (typeof START_GENERATION_ERROR_CODES)[keyof typeof START_GENERATION_ERROR_CODES];

export const GENERATION_ERROR_PHASES = {
  START_RPC: "start_rpc",
  STREAM: "stream",
  RECONNECT: "reconnect",
  PERSISTED_ERROR: "persisted_error",
} as const;

export type GenerationErrorPhase =
  (typeof GENERATION_ERROR_PHASES)[keyof typeof GENERATION_ERROR_PHASES];

export type GenerationErrorData = {
  generationErrorCode: string;
  phase: GenerationErrorPhase;
};

export const DEFAULT_GENERATION_ERROR_MESSAGE = "Generation failed. Please retry.";

export function isGenerationErrorData(value: unknown): value is GenerationErrorData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.generationErrorCode === "string" &&
    typeof candidate.phase === "string" &&
    Object.values(GENERATION_ERROR_PHASES).includes(candidate.phase as GenerationErrorPhase)
  );
}
