import { HeadBucketCommand } from "@aws-sdk/client-s3";
import {
  getControlPlaneHealth,
  isControlPlaneEnabled,
} from "@cmdclaw/core/server/control-plane/client";
import { editionCapabilities } from "@cmdclaw/core/server/edition";
import { buildRedisOptions } from "@cmdclaw/core/server/redis/connection-options";
import { isE2BConfigured } from "@cmdclaw/core/server/sandbox/e2b";
import { BUCKET_NAME, getS3Client } from "@cmdclaw/core/server/storage/s3-client";
import { db } from "@cmdclaw/db/client";
import { sql } from "drizzle-orm";
import IORedis from "ioredis";
import { env } from "@/env";

const redisBaseOptions = {
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
} as const;

export type InstanceHealthCheck = {
  ok: boolean;
  detail?: string;
};

export type InstanceHealthStatus = {
  ok: boolean;
  edition: "cloud" | "selfhost";
  checkedAt: string;
  checks: {
    database: InstanceHealthCheck;
    redis: InstanceHealthCheck;
    s3: InstanceHealthCheck;
    e2b: InstanceHealthCheck;
    controlPlane: InstanceHealthCheck;
  };
};

function toCheckResult(error: unknown, fallback: string): InstanceHealthCheck {
  return {
    ok: false,
    detail: error instanceof Error ? error.message : fallback,
  };
}

export async function getInstanceHealthStatus(): Promise<InstanceHealthStatus> {
  const checks: InstanceHealthStatus["checks"] = {
    database: { ok: false },
    redis: { ok: false },
    s3: { ok: false },
    e2b: { ok: false },
    controlPlane: { ok: !editionCapabilities.requiresCloudControlPlane },
  };

  try {
    await db.execute(sql`select 1`);
    checks.database = { ok: true };
  } catch (error) {
    checks.database = toCheckResult(error, "Database check failed");
  }

  try {
    const redis = new IORedis(buildRedisOptions(env.REDIS_URL, redisBaseOptions));
    try {
      const result = await redis.ping();
      checks.redis = {
        ok: result === "PONG",
        detail: result === "PONG" ? undefined : `Unexpected ping response: ${result}`,
      };
    } finally {
      await redis.quit().catch(() => redis.disconnect());
    }
  } catch (error) {
    checks.redis = toCheckResult(error, "Redis check failed");
  }

  try {
    const client = getS3Client();
    await client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    checks.s3 = { ok: true };
  } catch (error) {
    checks.s3 = toCheckResult(error, "S3 bucket check failed");
  }

  checks.e2b = isE2BConfigured()
    ? { ok: true, detail: "E2B API key configured" }
    : { ok: false, detail: "E2B_API_KEY is not configured" };

  if (isControlPlaneEnabled()) {
    try {
      const health = await getControlPlaneHealth();
      checks.controlPlane = {
        ok: health.ok,
        detail: health.ok ? `Cloud edition: ${health.edition}` : "Control plane reported unhealthy",
      };
    } catch (error) {
      checks.controlPlane = toCheckResult(error, "Cloud control plane is unreachable");
    }
  }

  const ok = Object.values(checks).every((check) => check.ok);

  return {
    ok,
    edition: editionCapabilities.edition,
    checkedAt: new Date().toISOString(),
    checks,
  };
}
