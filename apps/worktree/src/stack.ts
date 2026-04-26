export type WorktreeStackConfig = {
  slot: number;
  slotLabel: string;
  composeProjectName: string;
  otelGrpcPort: number;
  otelHttpPort: number;
  vectorTracePort: number;
  vectorLogPort: number;
  victoriaMetricsPort: number;
  victoriaLogsPort: number;
  victoriaTracesPort: number;
  vmalertPort: number;
  daytonaApiPort: number;
  daytonaProxyPort: number;
  daytonaSshGatewayPort: number;
  daytonaDexPort: number;
  victoriaMetricsVolume: string;
  victoriaLogsVolume: string;
  victoriaTracesVolume: string;
  daytonaDbVolume: string;
  daytonaDexVolume: string;
  daytonaRegistryVolume: string;
};

export type SharedStackConfig = {
  composeProjectName: string;
  postgresPort: number;
  redisPort: number;
  minioApiPort: number;
  minioConsolePort: number;
  grafanaPort: number;
  alertmanagerPort: number;
  postgresVolume: string;
  redisVolume: string;
  minioVolume: string;
  alertmanagerVolume: string;
  grafanaVolume: string;
};

export type WorktreeHostPort = {
  name: string;
  port: number;
};

function assertValidSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > 99) {
    throw new Error(`Worktree stack slot must be an integer between 1 and 99, received ${slot}`);
  }
}

function port(prefix: number, slot: number): number {
  return prefix * 100 + slot;
}

export function formatWorktreeStackSlot(slot: number): string {
  assertValidSlot(slot);
  return String(slot).padStart(2, "0");
}

export function buildWorktreeHostPorts(slot: number): WorktreeHostPort[] {
  const stack = buildWorktreeStackConfig("cmdclaw-slot", slot);

  return [
    { name: "app", port: port(37, slot) },
    { name: "ws", port: port(47, slot) },
    { name: "otel-grpc", port: stack.otelGrpcPort },
    { name: "otel-http", port: stack.otelHttpPort },
    { name: "vector-traces", port: stack.vectorTracePort },
    { name: "vector-logs", port: stack.vectorLogPort },
    { name: "victoria-metrics", port: stack.victoriaMetricsPort },
    { name: "victoria-logs", port: stack.victoriaLogsPort },
    { name: "victoria-traces", port: stack.victoriaTracesPort },
    { name: "vmalert", port: stack.vmalertPort },
    { name: "daytona-api", port: stack.daytonaApiPort },
    { name: "daytona-proxy", port: stack.daytonaProxyPort },
    { name: "daytona-ssh", port: stack.daytonaSshGatewayPort },
    { name: "daytona-dex", port: stack.daytonaDexPort },
  ];
}

export function buildSharedStackConfig(): SharedStackConfig {
  const parsePort = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };

  const composeProjectName = process.env.CMDCLAW_COMPOSE_PROJECT?.trim() || "cmdclaw-local";

  return {
    composeProjectName,
    postgresPort: parsePort(process.env.CMDCLAW_POSTGRES_PORT, 5433),
    redisPort: parsePort(process.env.CMDCLAW_REDIS_PORT, 6380),
    minioApiPort: parsePort(process.env.CMDCLAW_MINIO_API_PORT, 9100),
    minioConsolePort: parsePort(process.env.CMDCLAW_MINIO_CONSOLE_PORT, 9101),
    grafanaPort: parsePort(process.env.CMDCLAW_GRAFANA_PORT, 3400),
    alertmanagerPort: parsePort(process.env.CMDCLAW_ALERTMANAGER_PORT, 9093),
    postgresVolume:
      process.env.CMDCLAW_POSTGRES_VOLUME || `${composeProjectName}_cmdclaw_postgres_data`,
    redisVolume:
      process.env.CMDCLAW_REDIS_VOLUME || `${composeProjectName}_cmdclaw_redis_data`,
    minioVolume:
      process.env.CMDCLAW_MINIO_VOLUME || `${composeProjectName}_cmdclaw_minio_data`,
    alertmanagerVolume:
      process.env.CMDCLAW_ALERTMANAGER_VOLUME ||
      `${composeProjectName}_cmdclaw_alertmanager_data`,
    grafanaVolume:
      process.env.CMDCLAW_GRAFANA_VOLUME || `${composeProjectName}_cmdclaw_grafana_data`,
  };
}

export function buildWorktreeStackConfig(instanceId: string, slot: number): WorktreeStackConfig {
  assertValidSlot(slot);
  const slotLabel = formatWorktreeStackSlot(slot);
  const composeProjectName = instanceId;

  return {
    slot,
    slotLabel,
    composeProjectName,
    otelGrpcPort: port(431, slot),
    otelHttpPort: port(432, slot),
    vectorTracePort: port(53, slot),
    vectorLogPort: port(86, slot),
    victoriaMetricsPort: port(84, slot),
    victoriaLogsPort: port(94, slot),
    victoriaTracesPort: port(104, slot),
    vmalertPort: port(88, slot),
    daytonaApiPort: port(33, slot),
    daytonaProxyPort: port(40, slot),
    daytonaSshGatewayPort: port(22, slot),
    daytonaDexPort: port(55, slot),
    victoriaMetricsVolume: `${composeProjectName}_cmdclaw_victoria_metrics_data`,
    victoriaLogsVolume: `${composeProjectName}_cmdclaw_victoria_logs_data`,
    victoriaTracesVolume: `${composeProjectName}_cmdclaw_victoria_traces_data`,
    daytonaDbVolume: `${composeProjectName}_daytona_db_data`,
    daytonaDexVolume: `${composeProjectName}_daytona_dex_data`,
    daytonaRegistryVolume: `${composeProjectName}_daytona_registry_data`,
  };
}
