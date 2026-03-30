import type { GenerationErrorPhase } from "@cmdclaw/core/lib/generation-errors";
import {
  DEFAULT_GENERATION_ERROR_MESSAGE,
  isGenerationErrorData,
} from "@cmdclaw/core/lib/generation-errors";

export type NormalizedGenerationError = {
  code: string;
  message: string;
  phase: GenerationErrorPhase;
  transportCode?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function normalizeGenerationError(
  error: unknown,
  phase: GenerationErrorPhase,
): NormalizedGenerationError {
  let message = DEFAULT_GENERATION_ERROR_MESSAGE;
  let code = "unknown";
  let transportCode: string | undefined;
  let resolvedPhase = phase;

  if (typeof error === "string") {
    const trimmed = error.trim();
    if (trimmed) {
      message = trimmed;
    }
  } else if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (trimmed) {
      message = trimmed;
    }
  }

  if (isRecord(error)) {
    if (typeof error.message === "string" && error.message.trim()) {
      message = error.message.trim();
    }
    if (typeof error.code === "string" && error.code.trim()) {
      transportCode = error.code.trim();
    }
    if (isGenerationErrorData(error.data)) {
      code = error.data.generationErrorCode;
      resolvedPhase = error.data.phase;
    }
  }

  return {
    code,
    message,
    phase: resolvedPhase,
    transportCode,
  };
}
