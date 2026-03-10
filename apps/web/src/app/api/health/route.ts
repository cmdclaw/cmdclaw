import { buildRedisOptions } from "@cmdclaw/core/server/redis/connection-options";
import { db } from "@cmdclaw/db/client";
import { sql } from "drizzle-orm";
import IORedis from "ioredis";
import { NextResponse } from "next/server";
import { env } from "@/env";

const redisBaseOptions = {
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
} as const;

export async function GET() {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    await db.execute(sql`select 1`);
    checks.database = true;

    const redis = new IORedis(buildRedisOptions(env.REDIS_URL, redisBaseOptions));
    try {
      checks.redis = (await redis.ping()) === "PONG";
    } finally {
      await redis.quit().catch(() => redis.disconnect());
    }

    return NextResponse.json({ ok: true, checks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, checks, error: message }, { status: 503 });
  }
}
