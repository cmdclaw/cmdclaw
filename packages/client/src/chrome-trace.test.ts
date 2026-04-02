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
          prePromptSetupMs: 500,
          agentReadyToPromptMs: 600,
          waitForFirstEventMs: 200,
          promptToFirstTokenMs: 500,
          generationToFirstTokenMs: 2500,
          promptToFirstVisibleOutputMs: 600,
          generationToFirstVisibleOutputMs: 2600,
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
          { phase: "prompt_sent", at: "2026-04-02T10:00:02.000Z", elapsedMs: 2000 },
          {
            phase: "first_event_received",
            at: "2026-04-02T10:00:02.200Z",
            elapsedMs: 2200,
          },
          {
            phase: "first_token_emitted",
            at: "2026-04-02T10:00:02.500Z",
            elapsedMs: 2500,
          },
          {
            phase: "first_visible_output_emitted",
            at: "2026-04-02T10:00:02.600Z",
            elapsedMs: 2600,
          },
          {
            phase: "prompt_completed",
            at: "2026-04-02T10:00:04.000Z",
            elapsedMs: 4000,
          },
          {
            phase: "post_processing_started",
            at: "2026-04-02T10:00:04.100Z",
            elapsedMs: 4100,
          },
          {
            phase: "post_processing_completed",
            at: "2026-04-02T10:00:04.200Z",
            elapsedMs: 4200,
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
      ts: 2_200_000,
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
