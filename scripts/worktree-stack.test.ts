import { describe, expect, test } from "vitest";

import { buildWorktreeStackConfig, formatWorktreeStackSlot } from "./worktree-stack";

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
      postgresPort: 5407,
      redisPort: 6307,
      minioApiPort: 9107,
      minioConsolePort: 9207,
      otelGrpcPort: 43107,
      otelHttpPort: 43207,
      vectorLogPort: 8607,
      victoriaMetricsPort: 8407,
      victoriaLogsPort: 9407,
      victoriaTracesPort: 10407,
      alertmanagerPort: 9007,
      vmalertPort: 8807,
      grafanaPort: 7407,
      daytonaApiPort: 3307,
      daytonaProxyPort: 4007,
      daytonaSshGatewayPort: 2207,
      daytonaDexPort: 5507,
      postgresVolume: "cmdclaw-a1b2c3d4_cmdclaw_postgres_data",
      redisVolume: "cmdclaw-a1b2c3d4_cmdclaw_redis_data",
      minioVolume: "cmdclaw-a1b2c3d4_cmdclaw_minio_data",
      victoriaMetricsVolume: "cmdclaw-a1b2c3d4_cmdclaw_victoria_metrics_data",
      victoriaLogsVolume: "cmdclaw-a1b2c3d4_cmdclaw_victoria_logs_data",
      victoriaTracesVolume: "cmdclaw-a1b2c3d4_cmdclaw_victoria_traces_data",
      alertmanagerVolume: "cmdclaw-a1b2c3d4_cmdclaw_alertmanager_data",
      grafanaVolume: "cmdclaw-a1b2c3d4_cmdclaw_grafana_data",
      daytonaDbVolume: "cmdclaw-a1b2c3d4_daytona_db_data",
      daytonaDexVolume: "cmdclaw-a1b2c3d4_daytona_dex_data",
      daytonaRegistryVolume: "cmdclaw-a1b2c3d4_daytona_registry_data",
    });
  });

  test("rejects out-of-range slots", () => {
    expect(() => formatWorktreeStackSlot(0)).toThrow("between 1 and 99");
    expect(() => buildWorktreeStackConfig("cmdclaw-a1b2c3d4", 100)).toThrow("between 1 and 99");
  });
});
