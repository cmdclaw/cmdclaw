import IORedis from "ioredis";
import { prefixRedisKey } from "../instance";
import { buildRedisOptions } from "./connection-options";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const REDIS_OPTIONS = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
} as const;

// Slightly longer than the sandbox auto-stop window so a live reused sandbox
// always finds its marker, while stopped sandboxes age out naturally.
const APPLIED_CONFIG_TTL_SECONDS = 60 * 60;

function getRedisClient(): IORedis {
  const globalState = globalThis as typeof globalThis & {
    __bapSandboxMcpConfigCacheRedis?: IORedis;
  };
  if (!globalState.__bapSandboxMcpConfigCacheRedis) {
    globalState.__bapSandboxMcpConfigCacheRedis = new IORedis(
      buildRedisOptions(REDIS_URL, REDIS_OPTIONS),
    );
  }
  return globalState.__bapSandboxMcpConfigCacheRedis;
}

function appliedConfigKey(sandboxId: string): string {
  return prefixRedisKey(`sandbox:mcp-config-hash:${sandboxId}`);
}

export async function readSandboxAppliedMcpConfigHash(sandboxId: string): Promise<string | null> {
  return await getRedisClient().get(appliedConfigKey(sandboxId));
}

export async function writeSandboxAppliedMcpConfigHash(
  sandboxId: string,
  hash: string,
): Promise<void> {
  await getRedisClient().set(appliedConfigKey(sandboxId), hash, "EX", APPLIED_CONFIG_TTL_SECONDS);
}
