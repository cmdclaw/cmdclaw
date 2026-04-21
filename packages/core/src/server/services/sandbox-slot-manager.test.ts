import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDefaultMaxActiveSlots, SandboxSlotManager } from "./sandbox-slot-manager";

class FakeRedis {
  private readonly zsets = new Map<string, Map<string, number>>();
  private readonly strings = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private readonly now: () => number) {}

  async zadd(...args: Array<string | number>): Promise<number> {
    const [key, maybeMode, maybeScore, maybeMember, maybeAltScore, maybeAltMember] = args;
    const zset = this.getZset(String(key));
    const mode = typeof maybeMode === "string" && Number.isNaN(Number(maybeMode)) ? maybeMode : null;
    const score = Number(mode ? maybeScore : maybeMode);
    const member = String(mode ? maybeMember : maybeScore);
    const existing = zset.has(member);
    if (mode === "NX" && existing) {
      return 0;
    }
    zset.set(member, score);
    if (maybeAltScore !== undefined && maybeAltMember !== undefined) {
      zset.set(String(maybeAltMember), Number(maybeAltScore));
    }
    return existing ? 0 : 1;
  }

  async zcard(key: string): Promise<number> {
    return this.getZset(key).size;
  }

  async zrank(key: string, member: string): Promise<number | null> {
    const ordered = [...this.getZset(key).entries()].sort((a, b) => {
      if (a[1] !== b[1]) {
        return a[1] - b[1];
      }
      return a[0].localeCompare(b[0]);
    });
    const index = ordered.findIndex(([entry]) => entry === member);
    return index >= 0 ? index : null;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const zset = this.getZset(key);
    let removed = 0;
    for (const member of members) {
      if (zset.delete(member)) {
        removed += 1;
      }
    }
    return removed;
  }

  async zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number> {
    const zset = this.getZset(key);
    const lower = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const upper = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
    let removed = 0;
    for (const [member, score] of [...zset.entries()]) {
      if (score >= lower && score <= upper) {
        zset.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  async zscore(key: string, member: string): Promise<string | null> {
    const score = this.getZset(key).get(member);
    return score === undefined ? null : String(score);
  }

  async set(...args: Array<string | number>): Promise<string | null> {
    const [key, value, maybePx, maybeTtl, maybeNx] = args;
    const existing = await this.get(String(key));
    if (maybeNx === "NX" && existing !== null) {
      return null;
    }
    const ttl = maybePx === "PX" ? Number(maybeTtl) : null;
    this.strings.set(String(key), {
      value: String(value),
      expiresAt: ttl ? this.now() + ttl : null,
    });
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    const entry = this.strings.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.strings.delete(key);
      return null;
    }
    return entry.value;
  }

  async pexpire(key: string, ttl: number): Promise<number> {
    const entry = this.strings.get(key);
    if (!entry) {
      return 0;
    }
    this.strings.set(key, {
      ...entry,
      expiresAt: this.now() + ttl,
    });
    return 1;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.strings.delete(key)) {
        removed += 1;
      }
    }
    return removed;
  }

  private getZset(key: string): Map<string, number> {
    let zset = this.zsets.get(key);
    if (!zset) {
      zset = new Map();
      this.zsets.set(key, zset);
    }
    return zset;
  }
}

describe("SandboxSlotManager", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a lower default slot cap for live e2e runs", () => {
    vi.stubEnv("E2E_LIVE", "1");
    expect(resolveDefaultMaxActiveSlots()).toBe(4);
  });

  it("uses the standard slot cap outside live e2e runs", () => {
    vi.stubEnv("E2E_LIVE", "0");
    expect(resolveDefaultMaxActiveSlots()).toBe(20);
  });

  it("preserves FIFO order for waiting generations", async () => {
    let now = 1_000;
    const manager = new SandboxSlotManager({
      redis: new FakeRedis(() => now),
      maxActiveSlots: 1,
      disableLock: true,
      now: () => now,
    });

    const first = await manager.acquireLease("gen-1");
    const second = await manager.acquireLease("gen-2");
    now += 1;
    const third = await manager.acquireLease("gen-3");

    expect(first.granted).toBe(true);
    expect(second).toMatchObject({ granted: false, rank: 0 });
    expect(third).toMatchObject({ granted: false, rank: 1 });

    if (!first.granted) {
      throw new Error("expected first lease to be granted");
    }
    await manager.releaseLease("gen-1", first.token);

    const thirdRetry = await manager.acquireLease("gen-3");
    expect(thirdRetry).toMatchObject({ granted: false, rank: 1 });

    const secondRetry = await manager.acquireLease("gen-2");
    expect(secondRetry.granted).toBe(true);
  });

  it("holds the 21st request until a slot is released", async () => {
    let now = 10_000;
    const manager = new SandboxSlotManager({
      redis: new FakeRedis(() => now),
      maxActiveSlots: 20,
      disableLock: true,
      now: () => now,
    });

    const leases: Array<{ generationId: string; token: string }> = [];
    for (let i = 0; i < 20; i += 1) {
      const result = await manager.acquireLease(`gen-${i}`);
      if (!result.granted) {
        throw new Error(`expected gen-${i} to acquire a slot`);
      }
      leases.push({ generationId: `gen-${i}`, token: result.token });
    }

    const waiting = await manager.acquireLease("gen-21");
    expect(waiting).toMatchObject({
      granted: false,
      activeCount: 20,
      rank: 0,
    });

    const released = leases[0];
    await manager.releaseLease(released.generationId, released.token);
    const resumed = await manager.acquireLease("gen-21");
    expect(resumed.granted).toBe(true);
  });
});
