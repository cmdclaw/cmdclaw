import { describe, expect, test } from "vitest";

import {
  buildSharedStackConfig,
  buildWorktreeHostPorts,
  buildWorktreeStackConfig,
  formatWorktreeStackSlot,
} from "./stack";

const SHARED_STACK_ENV_KEYS = [
  "CMDCLAW_COMPOSE_PROJECT",
  "CMDCLAW_POSTGRES_PORT",
  "CMDCLAW_REDIS_PORT",
  "CMDCLAW_MINIO_API_PORT",
  "CMDCLAW_MINIO_CONSOLE_PORT",
  "CMDCLAW_GRAFANA_PORT",
  "CMDCLAW_ALERTMANAGER_PORT",
  "CMDCLAW_POSTGRES_VOLUME",
  "CMDCLAW_REDIS_VOLUME",
  "CMDCLAW_MINIO_VOLUME",
  "CMDCLAW_ALERTMANAGER_VOLUME",
  "CMDCLAW_GRAFANA_VOLUME",
] as const;

describe("worktree stack config", () => {
  test("formats worktree slots as two digits", () => {
    expect(formatWorktreeStackSlot(1)).toBe("01");
    expect(formatWorktreeStackSlot(17)).toBe("17");
    expect(formatWorktreeStackSlot(99)).toBe("99");
  });

  test("derives deterministic docker ports and names from the slot", () => {
    expect(buildWorktreeStackConfig("cmdclaw-a1b2c3d4", 7)).toEqual({
      slot: 7,
      slotLabel: "07",
      composeProjectName: "cmdclaw-a1b2c3d4",
      otelGrpcPort: 43107,
      otelHttpPort: 43207,
      vectorTracePort: 5307,
      vectorLogPort: 8607,
      victoriaMetricsPort: 8407,
      victoriaLogsPort: 9407,
      victoriaTracesPort: 10407,
      vmalertPort: 8807,
      daytonaApiPort: 3307,
      daytonaProxyPort: 4007,
      daytonaSshGatewayPort: 2207,
      daytonaDexPort: 5507,
      victoriaMetricsVolume: "cmdclaw-a1b2c3d4_cmdclaw_victoria_metrics_data",
      victoriaLogsVolume: "cmdclaw-a1b2c3d4_cmdclaw_victoria_logs_data",
      victoriaTracesVolume: "cmdclaw-a1b2c3d4_cmdclaw_victoria_traces_data",
      daytonaDbVolume: "cmdclaw-a1b2c3d4_daytona_db_data",
      daytonaDexVolume: "cmdclaw-a1b2c3d4_daytona_dex_data",
      daytonaRegistryVolume: "cmdclaw-a1b2c3d4_daytona_registry_data",
    });
  });

  test("lists every host port reserved by a slot", () => {
    expect(buildWorktreeHostPorts(7)).toEqual([
      { name: "app", port: 3707 },
      { name: "ws", port: 4707 },
      { name: "otel-grpc", port: 43107 },
      { name: "otel-http", port: 43207 },
      { name: "vector-traces", port: 5307 },
      { name: "vector-logs", port: 8607 },
      { name: "victoria-metrics", port: 8407 },
      { name: "victoria-logs", port: 9407 },
      { name: "victoria-traces", port: 10407 },
      { name: "vmalert", port: 8807 },
      { name: "daytona-api", port: 3307 },
      { name: "daytona-proxy", port: 4007 },
      { name: "daytona-ssh", port: 2207 },
      { name: "daytona-dex", port: 5507 },
    ]);
  });

  test("returns the shared stack ports and volumes", () => {
    const previousEnv = Object.fromEntries(
      SHARED_STACK_ENV_KEYS.map((key) => [key, process.env[key]]),
    );

    try {
      for (const key of SHARED_STACK_ENV_KEYS) {
        delete process.env[key];
      }

      expect(buildSharedStackConfig()).toEqual({
        composeProjectName: "cmdclaw-local",
        postgresPort: 5433,
        redisPort: 6380,
        minioApiPort: 9100,
        minioConsolePort: 9101,
        grafanaPort: 3400,
        alertmanagerPort: 9093,
        postgresVolume: "cmdclaw-local_cmdclaw_postgres_data",
        redisVolume: "cmdclaw-local_cmdclaw_redis_data",
        minioVolume: "cmdclaw-local_cmdclaw_minio_data",
        alertmanagerVolume: "cmdclaw-local_cmdclaw_alertmanager_data",
        grafanaVolume: "cmdclaw-local_cmdclaw_grafana_data",
      });
    } finally {
      for (const key of SHARED_STACK_ENV_KEYS) {
        const value = previousEnv[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  test("rejects out-of-range slots", () => {
    expect(() => formatWorktreeStackSlot(0)).toThrow("between 1 and 99");
    expect(() => buildWorktreeStackConfig("cmdclaw-a1b2c3d4", 100)).toThrow("between 1 and 99");
  });
});
