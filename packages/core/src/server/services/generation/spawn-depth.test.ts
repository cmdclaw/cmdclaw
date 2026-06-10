import { describe, expect, it } from "vitest";
import { evaluateSpawnRequest, MAX_SPAWN_DEPTH, resolveCallerSpawnDepth } from "./spawn-depth";

describe("spawn depth", () => {
  it("treats absent or invalid depths as zero", () => {
    expect(resolveCallerSpawnDepth(undefined)).toBe(0);
    expect(resolveCallerSpawnDepth(null)).toBe(0);
    expect(resolveCallerSpawnDepth(-1)).toBe(0);
    expect(resolveCallerSpawnDepth(1.5)).toBe(0);
    expect(resolveCallerSpawnDepth("2")).toBe(0);
    expect(resolveCallerSpawnDepth(2)).toBe(2);
  });

  it("allows spawning below the maximum depth and increments the child depth", () => {
    expect(evaluateSpawnRequest(0)).toEqual({ allowed: true, childSpawnDepth: 1 });
    expect(evaluateSpawnRequest(MAX_SPAWN_DEPTH - 1)).toEqual({
      allowed: true,
      childSpawnDepth: MAX_SPAWN_DEPTH,
    });
  });

  it("refuses at the maximum depth with an agent-relayable message", () => {
    const result = evaluateSpawnRequest(MAX_SPAWN_DEPTH);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.message).toContain("Spawn Depth");
      expect(result.message).toContain(String(MAX_SPAWN_DEPTH));
    }
  });

  it("refuses beyond the maximum depth", () => {
    expect(evaluateSpawnRequest(MAX_SPAWN_DEPTH + 5).allowed).toBe(false);
  });
});
