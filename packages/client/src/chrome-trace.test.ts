import { describe, expect, it } from "vitest";
import { buildChromeTraceFromTiming } from "./chrome-trace";

describe("buildChromeTraceFromTiming", () => {
  it("builds Chrome trace events from timing phases", () => {
    const result = buildChromeTraceFromTiming({
      processName: "cmdclaw chat",
      threadName: "conversation conv-1",
      timing: {
        phaseDurationsMs: {
          sandboxConnectOrCreateMs: 800,
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
          prePromptExecutorServerStartMs: 15,
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
          agentReadyToPromptMs: 700,
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
          { phase: "agent_init_started", at: "2026-04-02T10:00:00.100Z", elapsedMs: 100 },
          {
            phase: "agent_init_sandbox_checking_cache",
            at: "2026-04-02T10:00:00.110Z",
            elapsedMs: 110,
          },
          {
            phase: "agent_init_sandbox_created",
            at: "2026-04-02T10:00:00.910Z",
            elapsedMs: 910,
          },
          {
            phase: "agent_init_opencode_starting",
            at: "2026-04-02T10:00:00.920Z",
            elapsedMs: 920,
          },
          {
            phase: "agent_init_opencode_ready",
            at: "2026-04-02T10:00:01.020Z",
            elapsedMs: 1020,
          },
          {
            phase: "agent_init_session_creating",
            at: "2026-04-02T10:00:01.030Z",
            elapsedMs: 1030,
          },
          {
            phase: "agent_init_session_init_completed",
            at: "2026-04-02T10:00:01.230Z",
            elapsedMs: 1230,
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
            phase: "pre_prompt_executor_server_start_started",
            at: "2026-04-02T10:00:01.630Z",
            elapsedMs: 1630,
          },
          {
            phase: "pre_prompt_executor_server_start_completed",
            at: "2026-04-02T10:00:01.645Z",
            elapsedMs: 1645,
          },
          {
            phase: "pre_prompt_executor_server_wait_ready_started",
            at: "2026-04-02T10:00:01.645Z",
            elapsedMs: 1645,
          },
          {
            phase: "pre_prompt_executor_server_wait_ready_completed",
            at: "2026-04-02T10:00:01.680Z",
            elapsedMs: 1680,
          },
          {
            phase: "pre_prompt_executor_status_check_started",
            at: "2026-04-02T10:00:01.680Z",
            elapsedMs: 1680,
          },
          {
            phase: "pre_prompt_executor_status_check_completed",
            at: "2026-04-02T10:00:01.690Z",
            elapsedMs: 1690,
          },
          {
            phase: "pre_prompt_executor_oauth_reconcile_started",
            at: "2026-04-02T10:00:01.690Z",
            elapsedMs: 1690,
          },
          {
            phase: "pre_prompt_executor_oauth_reconcile_completed",
            at: "2026-04-02T10:00:01.700Z",
            elapsedMs: 1700,
          },
          {
            phase: "pre_prompt_executor_prepare_completed",
            at: "2026-04-02T10:00:01.700Z",
            elapsedMs: 1700,
          },
          {
            phase: "pre_prompt_skills_and_creds_load_started",
            at: "2026-04-02T10:00:01.705Z",
            elapsedMs: 1705,
          },
          {
            phase: "pre_prompt_skills_and_creds_load_completed",
            at: "2026-04-02T10:00:01.765Z",
            elapsedMs: 1765,
          },
          {
            phase: "pre_prompt_cache_read_started",
            at: "2026-04-02T10:00:01.770Z",
            elapsedMs: 1770,
          },
          {
            phase: "pre_prompt_cache_read_completed",
            at: "2026-04-02T10:00:01.800Z",
            elapsedMs: 1800,
          },
          {
            phase: "pre_prompt_skills_write_started",
            at: "2026-04-02T10:00:01.805Z",
            elapsedMs: 1805,
          },
          {
            phase: "pre_prompt_skills_write_completed",
            at: "2026-04-02T10:00:01.875Z",
            elapsedMs: 1875,
          },
          {
            phase: "pre_prompt_custom_integration_cli_write_started",
            at: "2026-04-02T10:00:01.880Z",
            elapsedMs: 1880,
          },
          {
            phase: "pre_prompt_custom_integration_cli_write_completed",
            at: "2026-04-02T10:00:01.900Z",
            elapsedMs: 1900,
          },
          {
            phase: "pre_prompt_custom_integration_permissions_write_started",
            at: "2026-04-02T10:00:01.905Z",
            elapsedMs: 1905,
          },
          {
            phase: "pre_prompt_custom_integration_permissions_write_completed",
            at: "2026-04-02T10:00:01.915Z",
            elapsedMs: 1915,
          },
          {
            phase: "pre_prompt_integration_skills_write_started",
            at: "2026-04-02T10:00:01.920Z",
            elapsedMs: 1920,
          },
          {
            phase: "pre_prompt_integration_skills_write_completed",
            at: "2026-04-02T10:00:01.960Z",
            elapsedMs: 1960,
          },
          {
            phase: "pre_prompt_cache_write_started",
            at: "2026-04-02T10:00:01.965Z",
            elapsedMs: 1965,
          },
          {
            phase: "pre_prompt_cache_write_completed",
            at: "2026-04-02T10:00:01.985Z",
            elapsedMs: 1985,
          },
          {
            phase: "pre_prompt_prompt_spec_compose_started",
            at: "2026-04-02T10:00:01.986Z",
            elapsedMs: 1986,
          },
          {
            phase: "pre_prompt_prompt_spec_compose_completed",
            at: "2026-04-02T10:00:01.996Z",
            elapsedMs: 1996,
          },
          {
            phase: "pre_prompt_event_stream_subscribe_started",
            at: "2026-04-02T10:00:01.997Z",
            elapsedMs: 1997,
          },
          {
            phase: "pre_prompt_event_stream_subscribe_completed",
            at: "2026-04-02T10:00:02.017Z",
            elapsedMs: 2017,
          },
          {
            phase: "pre_prompt_coworker_docs_stage_started",
            at: "2026-04-02T10:00:02.018Z",
            elapsedMs: 2018,
          },
          {
            phase: "pre_prompt_coworker_docs_stage_completed",
            at: "2026-04-02T10:00:02.038Z",
            elapsedMs: 2038,
          },
          {
            phase: "pre_prompt_attachments_stage_started",
            at: "2026-04-02T10:00:02.039Z",
            elapsedMs: 2039,
          },
          {
            phase: "pre_prompt_attachments_stage_completed",
            at: "2026-04-02T10:00:02.079Z",
            elapsedMs: 2079,
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
    expect(result.trace.traceEvents.slice(0, 2).map((event) => event.name)).toEqual([
      "process_name",
      "thread_name",
    ]);

    const spanNames = result.trace.traceEvents
      .filter((event) => event.ph === "X")
      .map((event) => event.name);
    expect(spanNames).toEqual([
      "generation_to_first_token",
      "generation_to_first_visible_output",
      "agent_init",
      "sandbox_connect_or_create",
      "opencode_ready",
      "session_ready",
      "agent_ready_to_prompt",
      "pre_prompt_setup",
      "pre_prompt_memory_sync",
      "pre_prompt_runtime_context_write",
      "pre_prompt_executor_bootstrap_load",
      "pre_prompt_executor_prepare",
      "pre_prompt_executor_config_write",
      "pre_prompt_executor_server_probe",
      "pre_prompt_executor_server_start",
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
      ts: 110_000,
      dur: 800_000,
    });

    const modelStream = result.trace.traceEvents.find((event) => event.name === "model_stream");
    expect(modelStream).toMatchObject({
      ts: 2_300_000,
      dur: 1_800_000,
    });
  });

  it("falls back to derived durations when a direct end timestamp is missing", () => {
    const result = buildChromeTraceFromTiming({
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

  it("skips export when phase timestamps are missing", () => {
    expect(
      buildChromeTraceFromTiming({
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
