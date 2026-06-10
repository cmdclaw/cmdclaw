export const MAX_SPAWN_DEPTH = 3;

export type SpawnRequestEvaluation =
  | { allowed: true; childSpawnDepth: number }
  | { allowed: false; message: string };

export function resolveCallerSpawnDepth(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return 0;
  }
  return value;
}

export function evaluateSpawnRequest(callerSpawnDepth: number): SpawnRequestEvaluation {
  const depth = resolveCallerSpawnDepth(callerSpawnDepth);
  if (depth >= MAX_SPAWN_DEPTH) {
    return {
      allowed: false,
      message:
        `Refused: this run is at Spawn Depth ${depth}, the maximum allowed (${MAX_SPAWN_DEPTH}). ` +
        "Runs started through CmdClaw tools cannot spawn further runs. " +
        "Relay this to the user and suggest restructuring the coworker chain.",
    };
  }
  return { allowed: true, childSpawnDepth: depth + 1 };
}
