import { describe, expect, test } from "vitest";

import {
  buildSharedStackConfig,
  buildWorktreeHostPorts,
  buildWorktreeStackConfig,
  formatWorktreeStackSlot,
} from "./stack";

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
    expect(buildSharedStackConfig()).toEqual({
      composeProjectName: "cmdclaw-shared",
      postgresPort: 5433,
      redisPort: 6380,
      minioApiPort: 9100,
      minioConsolePort: 9101,
      grafanaPort: 3400,
      alertmanagerPort: 9093,
      postgresVolume: "cmdclaw-shared_postgres_data",
      redisVolume: "cmdclaw-shared_redis_data",
      minioVolume: "cmdclaw-shared_minio_data",
      alertmanagerVolume: "cmdclaw-shared_alertmanager_data",
      grafanaVolume: "cmdclaw-shared_grafana_data",
    });
  });

  test("rejects out-of-range slots", () => {
    expect(() => formatWorktreeStackSlot(0)).toThrow("between 1 and 99");
    expect(() => buildWorktreeStackConfig("cmdclaw-a1b2c3d4", 100)).toThrow("between 1 and 99");
  });
});
