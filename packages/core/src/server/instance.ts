function normalizeInstanceEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function getInstanceId(): string | null {
  return normalizeInstanceEnv(process.env.CMDCLAW_INSTANCE_ID);
}

export function getRedisNamespace(): string {
  const explicit = normalizeInstanceEnv(process.env.CMDCLAW_REDIS_NAMESPACE);
  if (explicit) {
    return explicit.endsWith(":") ? explicit : `${explicit}:`;
  }

  const instanceId = getInstanceId();
  return instanceId ? `instance:${instanceId}:` : "";
}

export function prefixRedisKey(key: string): string {
  const namespace = getRedisNamespace();
  return namespace ? `${namespace}${key}` : key;
}
