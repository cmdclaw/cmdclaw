import { describe, expect, it } from "vitest";
import { buildPerfettoTraceFromTiming } from "./perfetto-trace";

describe("buildPerfettoTraceFromTiming", () => {
  it("builds Perfetto trace events from timing phases", () => {
    const result = buildPerfettoTraceFromTiming({
      processName: "cmdclaw chat",
      threadName: "conversation conv-1",
      timing: {
        phaseDurationsMs: {
          sandboxInitMs: 820,
          sandboxConnectOrCreateMs: 800,
          sandboxCreateMs: 790,
          opencodeReadyMs: 100,
          sessionReadyMs: 200,
          agentInitMs: 1300,
          prePromptSetupMs: 600,
          prePromptMemorySyncMs: 40,
          prePromptRuntimeContextWriteMs: 20,
          prePromptExecutorPrepareMs: 120,
          prePromptExecutorBootstrapLoadMs: 30,
          prePromptExecutorConfigWriteMs: 10,
          prePromptExecutorServerProbeMs: 10,
          prePromptExecutorServerWaitReadyMs: 35,
          prePromptExecutorStatusCheckMs: 10,
          prePromptExecutorOauthReconcileMs: 10,
          prePromptSkillsAndCredsLoadMs: 60,
          prePromptCacheReadMs: 30,
          prePromptSkillsWriteMs: 70,
          prePromptCustomIntegrationCliWriteMs: 20,
          prePromptCustomIntegrationPermissionsWriteMs: 10,
          prePromptIntegrationSkillsWriteMs: 40,
          prePromptCacheWriteMs: 20,
          prePromptPromptSpecComposeMs: 10,
          prePromptEventStreamSubscribeMs: 20,
          prePromptCoworkerDocsStageMs: 20,
          prePromptAttachmentsStageMs: 40,
          waitForFirstEventMs: 200,
          promptToFirstTokenMs: 500,
          generationToFirstTokenMs: 2600,
          promptToFirstVisibleOutputMs: 600,
          generationToFirstVisibleOutputMs: 2700,
          modelStreamMs: 1800,
          postProcessingMs: 100,
        },
        phaseTimestamps: [
          { phase: "generation_started", at: "2026-04-02T10:00:00.000Z", elapsedMs: 0 },
          { phase: "sandbox_init_started", at: "2026-04-02T10:00:00.100Z", elapsedMs: 100 },
          {
            phase: "sandbox_init_checking_cache",
            at: "2026-04-02T10:00:00.110Z",
            elapsedMs: 110,
          },
          {
            phase: "sandbox_init_creating",
            at: "2026-04-02T10:00:00.120Z",
            elapsedMs: 120,
          },
          {
            phase: "sandbox_init_created",
            at: "2026-04-02T10:00:00.910Z",
            elapsedMs: 910,
          },
          { phase: "agent_init_started", at: "2026-04-02T10:00:00.920Z", elapsedMs: 920 },
          {
            phase: "agent_init_opencode_starting",
            at: "2026-04-02T10:00:00.930Z",
            elapsedMs: 930,
          },
          {
            phase: "agent_init_opencode_ready",
            at: "2026-04-02T10:00:01.030Z",
            elapsedMs: 1030,
          },
          {
            phase: "agent_init_session_creating",
            at: "2026-04-02T10:00:01.040Z",
            elapsedMs: 1040,
          },
          {
            phase: "agent_init_session_init_completed",
            at: "2026-04-02T10:00:01.240Z",
            elapsedMs: 1240,
          },
          { phase: "agent_init_ready", at: "2026-04-02T10:00:01.400Z", elapsedMs: 1400 },
          {
            phase: "pre_prompt_setup_started",
            at: "2026-04-02T10:00:01.500Z",
            elapsedMs: 1500,
          },
          {
            phase: "pre_prompt_memory_sync_started",
            at: "2026-04-02T10:00:01.510Z",
            elapsedMs: 1510,
          },
          {
            phase: "pre_prompt_memory_sync_completed",
            at: "2026-04-02T10:00:01.550Z",
            elapsedMs: 1550,
          },
          {
            phase: "pre_prompt_runtime_context_write_started",
            at: "2026-04-02T10:00:01.555Z",
            elapsedMs: 1555,
          },
          {
            phase: "pre_prompt_runtime_context_write_completed",
            at: "2026-04-02T10:00:01.575Z",
            elapsedMs: 1575,
          },
          {
            phase: "pre_prompt_executor_prepare_started",
            at: "2026-04-02T10:00:01.580Z",
            elapsedMs: 1580,
          },
          {
            phase: "pre_prompt_executor_bootstrap_load_started",
            at: "2026-04-02T10:00:01.580Z",
            elapsedMs: 1580,
          },
          {
            phase: "pre_prompt_executor_bootstrap_load_completed",
            at: "2026-04-02T10:00:01.610Z",
            elapsedMs: 1610,
          },
          {
            phase: "pre_prompt_executor_config_write_started",
            at: "2026-04-02T10:00:01.610Z",
            elapsedMs: 1610,
          },
          {
            phase: "pre_prompt_executor_config_write_completed",
            at: "2026-04-02T10:00:01.620Z",
            elapsedMs: 1620,
          },
          {
            phase: "pre_prompt_executor_server_probe_started",
            at: "2026-04-02T10:00:01.620Z",
            elapsedMs: 1620,
          },
          {
            phase: "pre_prompt_executor_server_probe_completed",
            at: "2026-04-02T10:00:01.630Z",
            elapsedMs: 1630,
          },
          {
            phase: "pre_prompt_executor_server_wait_ready_started",
            at: "2026-04-02T10:00:01.630Z",
            elapsedMs: 1630,
          },
          {
            phase: "pre_prompt_executor_server_wait_ready_completed",
            at: "2026-04-02T10:00:01.665Z",
            elapsedMs: 1665,
          },
          {
            phase: "pre_prompt_executor_status_check_started",
            at: "2026-04-02T10:00:01.665Z",
            elapsedMs: 1665,
          },
          {
            phase: "pre_prompt_executor_status_check_completed",
            at: "2026-04-02T10:00:01.675Z",
            elapsedMs: 1675,
          },
          {
            phase: "pre_prompt_executor_oauth_reconcile_started",
            at: "2026-04-02T10:00:01.675Z",
            elapsedMs: 1675,
          },
          {
            phase: "pre_prompt_executor_oauth_reconcile_completed",
            at: "2026-04-02T10:00:01.685Z",
            elapsedMs: 1685,
          },
          {
            phase: "pre_prompt_executor_prepare_completed",
            at: "2026-04-02T10:00:01.685Z",
            elapsedMs: 1685,
          },
          {
            phase: "pre_prompt_skills_and_creds_load_started",
            at: "2026-04-02T10:00:01.690Z",
            elapsedMs: 1690,
          },
          {
            phase: "pre_prompt_skills_and_creds_load_completed",
            at: "2026-04-02T10:00:01.750Z",
            elapsedMs: 1750,
          },
          {
            phase: "pre_prompt_cache_read_started",
            at: "2026-04-02T10:00:01.755Z",
            elapsedMs: 1755,
          },
          {
            phase: "pre_prompt_cache_read_completed",
            at: "2026-04-02T10:00:01.785Z",
            elapsedMs: 1785,
          },
          {
            phase: "pre_prompt_skills_write_started",
            at: "2026-04-02T10:00:01.790Z",
            elapsedMs: 1790,
          },
          {
            phase: "pre_prompt_skills_write_completed",
            at: "2026-04-02T10:00:01.860Z",
            elapsedMs: 1860,
          },
          {
            phase: "pre_prompt_custom_integration_cli_write_started",
            at: "2026-04-02T10:00:01.865Z",
            elapsedMs: 1865,
          },
          {
            phase: "pre_prompt_custom_integration_cli_write_completed",
            at: "2026-04-02T10:00:01.885Z",
            elapsedMs: 1885,
          },
          {
            phase: "pre_prompt_custom_integration_permissions_write_started",
            at: "2026-04-02T10:00:01.890Z",
            elapsedMs: 1890,
          },
          {
            phase: "pre_prompt_custom_integration_permissions_write_completed",
            at: "2026-04-02T10:00:01.900Z",
            elapsedMs: 1900,
          },
          {
            phase: "pre_prompt_integration_skills_write_started",
            at: "2026-04-02T10:00:01.905Z",
            elapsedMs: 1905,
          },
          {
            phase: "pre_prompt_integration_skills_write_completed",
            at: "2026-04-02T10:00:01.945Z",
            elapsedMs: 1945,
          },
          {
            phase: "pre_prompt_cache_write_started",
            at: "2026-04-02T10:00:01.950Z",
            elapsedMs: 1950,
          },
          {
            phase: "pre_prompt_cache_write_completed",
            at: "2026-04-02T10:00:01.970Z",
            elapsedMs: 1970,
          },
          {
            phase: "pre_prompt_prompt_spec_compose_started",
            at: "2026-04-02T10:00:01.971Z",
            elapsedMs: 1971,
          },
          {
            phase: "pre_prompt_prompt_spec_compose_completed",
            at: "2026-04-02T10:00:01.981Z",
            elapsedMs: 1981,
          },
          {
            phase: "pre_prompt_event_stream_subscribe_started",
            at: "2026-04-02T10:00:01.982Z",
            elapsedMs: 1982,
          },
          {
            phase: "pre_prompt_event_stream_subscribe_completed",
            at: "2026-04-02T10:00:02.002Z",
            elapsedMs: 2002,
          },
          {
            phase: "pre_prompt_coworker_docs_stage_started",
            at: "2026-04-02T10:00:02.003Z",
            elapsedMs: 2003,
          },
          {
            phase: "pre_prompt_coworker_docs_stage_completed",
            at: "2026-04-02T10:00:02.023Z",
            elapsedMs: 2023,
          },
          {
            phase: "pre_prompt_attachments_stage_started",
            at: "2026-04-02T10:00:02.024Z",
            elapsedMs: 2024,
          },
          {
            phase: "pre_prompt_attachments_stage_completed",
            at: "2026-04-02T10:00:02.064Z",
            elapsedMs: 2064,
          },
          { phase: "prompt_sent", at: "2026-04-02T10:00:02.100Z", elapsedMs: 2100 },
          {
            phase: "first_event_received",
            at: "2026-04-02T10:00:02.300Z",
            elapsedMs: 2300,
          },
          {
            phase: "first_token_emitted",
            at: "2026-04-02T10:00:02.600Z",
            elapsedMs: 2600,
          },
          {
            phase: "first_visible_output_emitted",
            at: "2026-04-02T10:00:02.700Z",
            elapsedMs: 2700,
          },
          {
            phase: "prompt_completed",
            at: "2026-04-02T10:00:04.100Z",
            elapsedMs: 4100,
          },
          {
            phase: "post_processing_started",
            at: "2026-04-02T10:00:04.200Z",
            elapsedMs: 4200,
          },
          {
            phase: "post_processing_completed",
            at: "2026-04-02T10:00:04.300Z",
            elapsedMs: 4300,
          },
        ],
      },
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.trace.displayTimeUnit).toBe("ms");
    const metadataEvents = result.trace.traceEvents.filter((event) => event.ph === "M");
    expect(metadataEvents.map((event) => event.name)).toEqual([
      "process_name",
      "thread_name",
      "thread_name",
      "thread_name",
      "thread_name",
      "thread_name",
      "thread_name",
      "thread_name",
      "thread_name",
    ]);
    expect(
      metadataEvents
        .filter((event) => event.name === "thread_name")
        .map((event) => event.args.name),
    ).toEqual([
      "summary",
      "sandbox_init",
      "agent_init",
      "pre_prompt_memory",
      "pre_prompt_skills",
      "pre_prompt_integration",
      "pre_prompt_runtime",
      "executor_prepare",
    ]);

    const spanNames = result.trace.traceEvents
      .filter((event) => event.ph === "X")
      .map((event) => event.name);
    expect(spanNames).toEqual([
      "generation_to_first_token",
      "generation_to_first_visible_output",
      "sandbox_init",
      "sandbox_connect_or_create",
      "sandbox_create",
      "agent_init",
      "opencode_ready",
      "session_ready",
      "pre_prompt_setup",
      "pre_prompt_memory_sync",
      "pre_prompt_runtime_context_write",
      "pre_prompt_executor_bootstrap_load",
      "pre_prompt_executor_prepare",
      "pre_prompt_executor_config_write",
      "pre_prompt_executor_server_probe",
      "pre_prompt_executor_server_wait_ready",
      "pre_prompt_executor_status_check",
      "pre_prompt_executor_oauth_reconcile",
      "pre_prompt_skills_and_creds_load",
      "pre_prompt_cache_read",
      "pre_prompt_skills_write",
      "pre_prompt_custom_integration_cli_write",
      "pre_prompt_custom_integration_permissions_write",
      "pre_prompt_integration_skills_write",
      "pre_prompt_cache_write",
      "pre_prompt_prompt_spec_compose",
      "pre_prompt_event_stream_subscribe",
      "pre_prompt_coworker_docs_stage",
      "pre_prompt_attachments_stage",
      "prompt_to_first_token",
      "prompt_to_first_visible_output",
      "wait_for_first_event",
      "model_stream",
      "post_processing",
    ]);

    const sandbox = result.trace.traceEvents.find((event) => event.name === "sandbox_connect_or_create");
    expect(sandbox).toMatchObject({
      tid: 2,
      ts: 110_000,
      dur: 800_000,
    });

    const sandboxInit = result.trace.traceEvents.find((event) => event.name === "sandbox_init");
    expect(sandboxInit).toMatchObject({
      tid: 2,
      ts: 100_000,
      dur: 820_000,
    });

    const sandboxCreate = result.trace.traceEvents.find((event) => event.name === "sandbox_create");
    expect(sandboxCreate).toMatchObject({
      tid: 2,
      ts: 120_000,
      dur: 790_000,
    });

    const opencodeReady = result.trace.traceEvents.find((event) => event.name === "opencode_ready");
    expect(opencodeReady).toMatchObject({
      tid: 3,
      ts: 930_000,
      dur: 100_000,
    });

    const prePromptSetup = result.trace.traceEvents.find((event) => event.name === "pre_prompt_setup");
    expect(prePromptSetup).toMatchObject({
      tid: 1,
      ts: 1_500_000,
      dur: 600_000,
    });

    const memorySync = result.trace.traceEvents.find((event) => event.name === "pre_prompt_memory_sync");
    expect(memorySync).toMatchObject({
      tid: 4,
      ts: 1_510_000,
      dur: 40_000,
    });

    const skillsWrite = result.trace.traceEvents.find((event) => event.name === "pre_prompt_skills_write");
    expect(skillsWrite).toMatchObject({
      tid: 5,
      ts: 1_790_000,
      dur: 70_000,
    });

    const integrationSkillsWrite = result.trace.traceEvents.find(
      (event) => event.name === "pre_prompt_integration_skills_write",
    );
    expect(integrationSkillsWrite).toMatchObject({
      tid: 6,
      ts: 1_905_000,
      dur: 40_000,
    });

    const runtimeContextWrite = result.trace.traceEvents.find(
      (event) => event.name === "pre_prompt_runtime_context_write",
    );
    expect(runtimeContextWrite).toMatchObject({
      tid: 7,
      ts: 1_555_000,
      dur: 20_000,
    });

    const executorPrepare = result.trace.traceEvents.find(
      (event) => event.name === "pre_prompt_executor_prepare",
    );
    expect(executorPrepare).toMatchObject({
      tid: 8,
      ts: 1_580_000,
      dur: 105_000,
    });

    const modelStream = result.trace.traceEvents.find((event) => event.name === "model_stream");
    expect(modelStream).toMatchObject({
      tid: 1,
      ts: 2_300_000,
      dur: 1_800_000,
    });
  });

  it("falls back to derived durations when a direct end timestamp is missing", () => {
    const result = buildPerfettoTraceFromTiming({
      timing: {
        phaseDurationsMs: {
          promptToFirstVisibleOutputMs: 600,
        },
        phaseTimestamps: [
          { phase: "prompt_sent", at: "2026-04-02T10:00:02.000Z", elapsedMs: 2000 },
          { phase: "first_token_emitted", at: "2026-04-02T10:00:02.500Z", elapsedMs: 2500 },
        ],
      },
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    const visible = result.trace.traceEvents.find(
      (event) => event.name === "prompt_to_first_visible_output",
    );
    expect(visible).toMatchObject({
      ts: 0,
      dur: 500_000,
    });
  });

  it("keeps executor prepare spans when oauth reconcile completes after prompt send", () => {
    const result = buildPerfettoTraceFromTiming({
      timing: {
        phaseDurationsMs: {
          prePromptSetupMs: 120,
          prePromptExecutorPrepareMs: 271,
          prePromptExecutorStatusCheckMs: 80,
          prePromptExecutorOauthReconcileMs: 160,
          promptToFirstTokenMs: 90,
        },
        phaseTimestamps: [
          {
            phase: "pre_prompt_setup_started",
            at: "2026-04-02T10:00:01.000Z",
            elapsedMs: 1000,
          },
          {
            phase: "pre_prompt_executor_prepare_started",
            at: "2026-04-02T10:00:01.010Z",
            elapsedMs: 1010,
          },
          {
            phase: "pre_prompt_executor_status_check_started",
            at: "2026-04-02T10:00:01.040Z",
            elapsedMs: 1040,
          },
          {
            phase: "pre_prompt_executor_status_check_completed",
            at: "2026-04-02T10:00:01.120Z",
            elapsedMs: 1120,
          },
          { phase: "prompt_sent", at: "2026-04-02T10:00:01.120Z", elapsedMs: 1120 },
          {
            phase: "first_token_emitted",
            at: "2026-04-02T10:00:01.210Z",
            elapsedMs: 1210,
          },
          {
            phase: "pre_prompt_executor_oauth_reconcile_started",
            at: "2026-04-02T10:00:01.121Z",
            elapsedMs: 1121,
          },
          {
            phase: "pre_prompt_executor_oauth_reconcile_completed",
            at: "2026-04-02T10:00:01.281Z",
            elapsedMs: 1281,
          },
          {
            phase: "pre_prompt_executor_prepare_completed",
            at: "2026-04-02T10:00:01.281Z",
            elapsedMs: 1281,
          },
        ],
      },
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    const executorPrepare = result.trace.traceEvents.find(
      (event) => event.name === "pre_prompt_executor_prepare",
    );
    expect(executorPrepare).toMatchObject({
      ts: 10_000,
      dur: 271_000,
    });

    const promptToFirstToken = result.trace.traceEvents.find(
      (event) => event.name === "prompt_to_first_token",
    );
    expect(promptToFirstToken).toMatchObject({
      ts: 120_000,
      dur: 90_000,
    });
  });

  it("skips export when phase timestamps are missing", () => {
    expect(
      buildPerfettoTraceFromTiming({
        timing: {
          phaseDurationsMs: {
            sandboxConnectOrCreateMs: 500,
          },
        },
      }),
    ).toEqual({
      status: "missing_phase_timestamps",
    });
  });
});
