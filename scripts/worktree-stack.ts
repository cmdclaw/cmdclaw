export type WorktreeStackConfig = {
  slot: number;
  slotLabel: string;
  composeProjectName: string;
  postgresPort: number;
  redisPort: number;
  minioApiPort: number;
  minioConsolePort: number;
  jaegerUiPort: number;
  otelGrpcPort: number;
  otelHttpPort: number;
  vectorLogPort: number;
  victoriaMetricsPort: number;
  victoriaLogsPort: number;
  victoriaTracesPort: number;
  alertmanagerPort: number;
  vmalertPort: number;
  grafanaPort: number;
  daytonaApiPort: number;
  daytonaProxyPort: number;
  daytonaSshGatewayPort: number;
  daytonaDexPort: number;
  postgresVolume: string;
  redisVolume: string;
  minioVolume: string;
  victoriaMetricsVolume: string;
  victoriaLogsVolume: string;
  victoriaTracesVolume: string;
  alertmanagerVolume: string;
  grafanaVolume: string;
  daytonaDbVolume: string;
  daytonaDexVolume: string;
  daytonaRegistryVolume: string;
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

export function buildWorktreeStackConfig(instanceId: string, slot: number): WorktreeStackConfig {
  assertValidSlot(slot);
  const slotLabel = formatWorktreeStackSlot(slot);
  const composeProjectName = instanceId;

  return {
    slot,
    slotLabel,
    composeProjectName,
    postgresPort: port(54, slot),
    redisPort: port(63, slot),
    minioApiPort: port(91, slot),
    minioConsolePort: port(92, slot),
    jaegerUiPort: port(166, slot),
    otelGrpcPort: port(431, slot),
    otelHttpPort: port(432, slot),
    vectorLogPort: port(86, slot),
    victoriaMetricsPort: port(84, slot),
    victoriaLogsPort: port(94, slot),
    victoriaTracesPort: port(104, slot),
    alertmanagerPort: port(90, slot),
    vmalertPort: port(88, slot),
    grafanaPort: port(74, slot),
    daytonaApiPort: port(33, slot),
    daytonaProxyPort: port(40, slot),
    daytonaSshGatewayPort: port(22, slot),
    daytonaDexPort: port(55, slot),
    postgresVolume: `${composeProjectName}_cmdclaw_postgres_data`,
    redisVolume: `${composeProjectName}_cmdclaw_redis_data`,
    minioVolume: `${composeProjectName}_cmdclaw_minio_data`,
    victoriaMetricsVolume: `${composeProjectName}_cmdclaw_victoria_metrics_data`,
    victoriaLogsVolume: `${composeProjectName}_cmdclaw_victoria_logs_data`,
    victoriaTracesVolume: `${composeProjectName}_cmdclaw_victoria_traces_data`,
    alertmanagerVolume: `${composeProjectName}_cmdclaw_alertmanager_data`,
    grafanaVolume: `${composeProjectName}_cmdclaw_grafana_data`,
    daytonaDbVolume: `${composeProjectName}_daytona_db_data`,
    daytonaDexVolume: `${composeProjectName}_daytona_dex_data`,
    daytonaRegistryVolume: `${composeProjectName}_daytona_registry_data`,
  };
}
