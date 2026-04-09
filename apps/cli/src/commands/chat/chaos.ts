export function parseChaosDurationMs(input: string): number {
  const trimmed = input.trim();
  const match = /^([1-9]\d*)(ms|s|m)$/.exec(trimmed);
  if (!match) {
    throw new Error("Invalid duration. Use a positive value with ms, s, or m suffix (for example: 60s).");
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "ms" ? 1 : unit === "s" ? 1_000 : 60_000;
  const durationMs = amount * multiplier;

  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new Error("Invalid duration. Duration must be a positive safe integer in milliseconds.");
  }

  return durationMs;
}
