import { GENERATION_ERROR_PHASES } from "@cmdclaw/core/lib/generation-errors";
import { describe, expect, it } from "vitest";
import { normalizeGenerationError } from "./generation-errors";

describe("normalizeGenerationError", () => {
  it("rewrites the sandbox connection error with a dev-server hint", () => {
    const result = normalizeGenerationError(
      "Command failed, Error: Unable to connect. Is the computer able to access the url?",
      GENERATION_ERROR_PHASES.STREAM,
    );

    expect(result.message).toBe(
      "Unable to connect. Maybe you forgot to start the server with `bun run dev`?",
    );
  });

  it("preserves unrelated error messages", () => {
    const result = normalizeGenerationError("Something else failed", GENERATION_ERROR_PHASES.STREAM);

    expect(result.message).toBe("Something else failed");
  });
});
