import crypto from "crypto";
import IORedis from "ioredis";
import { prefixRedisKey } from "../instance";
import { buildRedisOptions } from "../redis/connection-options";

const DEFAULT_MAX_ACTIVE_SLOTS = 20;
const DEFAULT_LEASE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 5_000;
const DEFAULT_LOCK_WAIT_MS = 50;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

type RedisLike = {
  zadd: (...args: Array<string | number>) => Promise<number>;
  zcard: (key: string) => Promise<number>;
  zrank: (key: string, member: string) => Promise<number | null>;
  zrem: (key: string, ...members: string[]) => Promise<number>;
  zremrangebyscore: (key: string, min: string | number, max: string | number) => Promise<number>;
  zscore: (key: string, member: string) => Promise<string | null>;
  set: (...args: Array<string | number>) => Promise<string | null>;
  get: (key: string) => Promise<string | null>;
  pexpire: (key: string, ttl: number) => Promise<number>;
  del: (...keys: string[]) => Promise<number>;
};

export type SandboxSlotAcquireResult =
  | {
      granted: true;
      token: string;
      activeCount: number;
      requestAtMs: number;
    }
  | {
      granted: false;
      activeCount: number;
      rank: number;
      requestAtMs: number;
    };

export class SandboxSlotManager {
  private readonly redis: RedisLike;
  private readonly maxActiveSlots: number;
  private readonly leaseTtlMs: number;
  private readonly lockTtlMs: number;
  private readonly lockWaitMs: number;
  private readonly now: () => number;
  private readonly disableLock: boolean;

  constructor(options?: {
    redis?: RedisLike;
    maxActiveSlots?: number;
    leaseTtlMs?: number;
    lockTtlMs?: number;
    lockWaitMs?: number;
    now?: () => number;
    disableLock?: boolean;
  }) {
    this.redis = options?.redis ?? (getSandboxSlotRedis() as unknown as RedisLike);
    this.maxActiveSlots = options?.maxActiveSlots ?? DEFAULT_MAX_ACTIVE_SLOTS;
    this.leaseTtlMs = options?.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.lockTtlMs = options?.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
    this.lockWaitMs = options?.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;
    this.now = options?.now ?? Date.now;
    this.disableLock = options?.disableLock ?? false;
  }

  async acquireLease(generationId: string): Promise<SandboxSlotAcquireResult> {
    return this.withLock(async () => {
      const now = this.now();
      await this.cleanupExpiredLeases(now);

      const existingToken = await this.redis.get(this.getLeaseTokenKey(generationId));
      const existingRequestAt = await this.resolveRequestAtMs(generationId, now);
      if (existingToken) {
        await this.redis.zadd(this.getActiveLeasesKey(), now + this.leaseTtlMs, generationId);
        await this.redis.pexpire(this.getLeaseTokenKey(generationId), this.leaseTtlMs);
        return {
          granted: true,
          token: existingToken,
          activeCount: await this.redis.zcard(this.getActiveLeasesKey()),
          requestAtMs: existingRequestAt,
        };
      }

      await this.redis.zadd(this.getWaitingQueueKey(), "NX", existingRequestAt, generationId);
      const rank = (await this.redis.zrank(this.getWaitingQueueKey(), generationId)) ?? 0;
      const activeCount = await this.redis.zcard(this.getActiveLeasesKey());
      if (rank === 0 && activeCount < this.maxActiveSlots) {
        const token = crypto.randomUUID();
        await this.redis.zrem(this.getWaitingQueueKey(), generationId);
        await this.redis.zadd(this.getActiveLeasesKey(), now + this.leaseTtlMs, generationId);
        await this.redis.set(
          this.getLeaseTokenKey(generationId),
          token,
          "PX",
          this.leaseTtlMs,
        );
        return {
          granted: true,
          token,
          activeCount: activeCount + 1,
          requestAtMs: existingRequestAt,
        };
      }

      return {
        granted: false,
        activeCount,
        rank,
        requestAtMs: existingRequestAt,
      };
    });
  }

  async renewLease(generationId: string, token: string): Promise<boolean> {
    const existingToken = await this.redis.get(this.getLeaseTokenKey(generationId));
    if (existingToken !== token) {
      return false;
    }

    const now = this.now();
    await this.redis.zadd(this.getActiveLeasesKey(), now + this.leaseTtlMs, generationId);
    await this.redis.pexpire(this.getLeaseTokenKey(generationId), this.leaseTtlMs);
    return true;
  }

  async releaseLease(generationId: string, token?: string): Promise<void> {
    await this.withLock(async () => {
      const existingToken = await this.redis.get(this.getLeaseTokenKey(generationId));
      if (!token || existingToken === token) {
        await this.redis.del(this.getLeaseTokenKey(generationId));
        await this.redis.zrem(this.getActiveLeasesKey(), generationId);
      }
      await this.redis.zrem(this.getWaitingQueueKey(), generationId);
    });
  }

  async clearPendingRequest(generationId: string): Promise<void> {
    await this.redis.zrem(this.getWaitingQueueKey(), generationId);
  }

  async hasActiveLease(generationId: string): Promise<boolean> {
    await this.cleanupExpiredLeases(this.now());
    return (await this.redis.zscore(this.getActiveLeasesKey(), generationId)) !== null;
  }

  private async cleanupExpiredLeases(now: number): Promise<void> {
    await this.redis.zremrangebyscore(this.getActiveLeasesKey(), "-inf", now);
  }

  private async resolveRequestAtMs(generationId: string, fallbackNow: number): Promise<number> {
    const existingScore = await this.redis.zscore(this.getWaitingQueueKey(), generationId);
    const parsed = existingScore ? Number(existingScore) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallbackNow;
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.disableLock) {
      return fn();
    }

    const key = this.getLockKey();
    const token = crypto.randomUUID();
    while (true) {
      const acquired = await this.redis.set(key, token, "PX", this.lockTtlMs, "NX");
      if (acquired === "OK") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, this.lockWaitMs));
    }

    try {
      return await fn();
    } finally {
      const owner = await this.redis.get(key);
      if (owner === token) {
        await this.redis.del(key);
      }
    }
  }

  private getWaitingQueueKey(): string {
    return prefixRedisKey("sandbox-slot:waiting");
  }

  private getActiveLeasesKey(): string {
    return prefixRedisKey("sandbox-slot:leases");
  }

  private getLeaseTokenKey(generationId: string): string {
    return prefixRedisKey(`sandbox-slot:lease-token:${generationId}`);
  }

  private getLockKey(): string {
    return prefixRedisKey("sandbox-slot:lock");
  }
}

let sharedRedis: IORedis | undefined;

function getSandboxSlotRedis(): IORedis {
  if (!sharedRedis) {
    sharedRedis = new IORedis(
      buildRedisOptions(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
    );
  }

  return sharedRedis;
}

let sharedSandboxSlotManager: SandboxSlotManager | undefined;

export function getSandboxSlotManager(): SandboxSlotManager {
  if (!sharedSandboxSlotManager) {
    sharedSandboxSlotManager = new SandboxSlotManager();
  }

  return sharedSandboxSlotManager;
}
