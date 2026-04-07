import type { DoneArtifactsData } from "./types";

type TimingData = DoneArtifactsData["timing"];
type PhaseDurations = NonNullable<NonNullable<TimingData>["phaseDurationsMs"]>;

export type ChromeTraceEvent = {
  name: string;
  cat: string;
  ph: "M" | "X";
  pid: number;
  tid: number;
  ts: number;
  dur?: number;
  args: Record<string, unknown>;
};

export type ChromeTrace = {
  traceEvents: ChromeTraceEvent[];
  displayTimeUnit: "ms";
};

export type ChromeTraceBuildResult =
  | {
      status: "ok";
      trace: ChromeTrace;
    }
  | {
      status: "missing_phase_timestamps";
    };

type TracePhaseSpec = {
  name:
    | "sandbox_connect_or_create"
    | "opencode_ready"
    | "session_ready"
    | "agent_init"
    | "pre_prompt_setup"
    | "pre_prompt_memory_sync"
    | "pre_prompt_runtime_context_write"
    | "pre_prompt_executor_prepare"
    | "pre_prompt_executor_bootstrap_load"
    | "pre_prompt_executor_config_write"
    | "pre_prompt_executor_server_probe"
    | "pre_prompt_executor_server_start"
    | "pre_prompt_executor_server_wait_ready"
    | "pre_prompt_executor_status_check"
    | "pre_prompt_executor_oauth_reconcile"
    | "pre_prompt_skills_and_creds_load"
    | "pre_prompt_cache_read"
    | "pre_prompt_skills_write"
    | "pre_prompt_custom_integration_cli_write"
    | "pre_prompt_custom_integration_permissions_write"
    | "pre_prompt_integration_skills_write"
    | "pre_prompt_cache_write"
    | "pre_prompt_prompt_spec_compose"
    | "pre_prompt_event_stream_subscribe"
    | "pre_prompt_coworker_docs_stage"
    | "pre_prompt_attachments_stage"
    | "agent_ready_to_prompt"
    | "wait_for_first_event"
    | "prompt_to_first_token"
    | "generation_to_first_token"
    | "prompt_to_first_visible_output"
    | "generation_to_first_visible_output"
    | "model_stream"
    | "post_processing";
  durationKey?: keyof PhaseDurations;
  startPhases?: string[];
  endPhases?: string[];
};

const TRACE_PHASE_SPECS: TracePhaseSpec[] = [
  {
    name: "sandbox_connect_or_create",
    durationKey: "sandboxConnectOrCreateMs",
    startPhases: ["agent_init_sandbox_checking_cache", "agent_init_started"],
    endPhases: ["agent_init_sandbox_reused", "agent_init_sandbox_created"],
  },
  {
    name: "opencode_ready",
    durationKey: "opencodeReadyMs",
    startPhases: ["agent_init_opencode_starting"],
    endPhases: ["agent_init_opencode_ready"],
  },
  {
    name: "session_ready",
    durationKey: "sessionReadyMs",
    startPhases: ["agent_init_session_creating", "agent_init_sandbox_reused"],
    endPhases: ["agent_init_session_init_completed", "agent_init_session_reused"],
  },
  {
    name: "agent_init",
    durationKey: "agentInitMs",
    startPhases: ["agent_init_started"],
    endPhases: ["agent_init_ready"],
  },
  {
    name: "pre_prompt_setup",
    durationKey: "prePromptSetupMs",
    startPhases: ["pre_prompt_setup_started"],
    endPhases: ["prompt_sent"],
  },
  {
    name: "pre_prompt_memory_sync",
    durationKey: "prePromptMemorySyncMs",
    startPhases: ["pre_prompt_memory_sync_started"],
    endPhases: ["pre_prompt_memory_sync_completed"],
  },
  {
    name: "pre_prompt_runtime_context_write",
    durationKey: "prePromptRuntimeContextWriteMs",
    startPhases: ["pre_prompt_runtime_context_write_started"],
    endPhases: ["pre_prompt_runtime_context_write_completed"],
  },
  {
    name: "pre_prompt_executor_prepare",
    durationKey: "prePromptExecutorPrepareMs",
    startPhases: ["pre_prompt_executor_prepare_started"],
    endPhases: ["pre_prompt_executor_prepare_completed"],
  },
  {
    name: "pre_prompt_executor_bootstrap_load",
    durationKey: "prePromptExecutorBootstrapLoadMs",
    startPhases: ["pre_prompt_executor_bootstrap_load_started"],
    endPhases: ["pre_prompt_executor_bootstrap_load_completed"],
  },
  {
    name: "pre_prompt_executor_config_write",
    durationKey: "prePromptExecutorConfigWriteMs",
    startPhases: ["pre_prompt_executor_config_write_started"],
    endPhases: ["pre_prompt_executor_config_write_completed"],
  },
  {
    name: "pre_prompt_executor_server_probe",
    durationKey: "prePromptExecutorServerProbeMs",
    startPhases: ["pre_prompt_executor_server_probe_started"],
    endPhases: ["pre_prompt_executor_server_probe_completed"],
  },
  {
    name: "pre_prompt_executor_server_start",
    durationKey: "prePromptExecutorServerStartMs",
    startPhases: ["pre_prompt_executor_server_start_started"],
    endPhases: ["pre_prompt_executor_server_start_completed"],
  },
  {
    name: "pre_prompt_executor_server_wait_ready",
    durationKey: "prePromptExecutorServerWaitReadyMs",
    startPhases: ["pre_prompt_executor_server_wait_ready_started"],
    endPhases: ["pre_prompt_executor_server_wait_ready_completed"],
  },
  {
    name: "pre_prompt_executor_status_check",
    durationKey: "prePromptExecutorStatusCheckMs",
    startPhases: ["pre_prompt_executor_status_check_started"],
    endPhases: ["pre_prompt_executor_status_check_completed"],
  },
  {
    name: "pre_prompt_executor_oauth_reconcile",
    durationKey: "prePromptExecutorOauthReconcileMs",
    startPhases: ["pre_prompt_executor_oauth_reconcile_started"],
    endPhases: ["pre_prompt_executor_oauth_reconcile_completed"],
  },
  {
    name: "pre_prompt_skills_and_creds_load",
    durationKey: "prePromptSkillsAndCredsLoadMs",
    startPhases: ["pre_prompt_skills_and_creds_load_started"],
    endPhases: ["pre_prompt_skills_and_creds_load_completed"],
  },
  {
    name: "pre_prompt_cache_read",
    durationKey: "prePromptCacheReadMs",
    startPhases: ["pre_prompt_cache_read_started"],
    endPhases: ["pre_prompt_cache_read_completed"],
  },
  {
    name: "pre_prompt_skills_write",
    durationKey: "prePromptSkillsWriteMs",
    startPhases: ["pre_prompt_skills_write_started"],
    endPhases: ["pre_prompt_skills_write_completed"],
  },
  {
    name: "pre_prompt_custom_integration_cli_write",
    durationKey: "prePromptCustomIntegrationCliWriteMs",
    startPhases: ["pre_prompt_custom_integration_cli_write_started"],
    endPhases: ["pre_prompt_custom_integration_cli_write_completed"],
  },
  {
    name: "pre_prompt_custom_integration_permissions_write",
    durationKey: "prePromptCustomIntegrationPermissionsWriteMs",
    startPhases: ["pre_prompt_custom_integration_permissions_write_started"],
    endPhases: ["pre_prompt_custom_integration_permissions_write_completed"],
  },
  {
    name: "pre_prompt_integration_skills_write",
    durationKey: "prePromptIntegrationSkillsWriteMs",
    startPhases: ["pre_prompt_integration_skills_write_started"],
    endPhases: ["pre_prompt_integration_skills_write_completed"],
  },
  {
    name: "pre_prompt_cache_write",
    durationKey: "prePromptCacheWriteMs",
    startPhases: ["pre_prompt_cache_write_started"],
    endPhases: ["pre_prompt_cache_write_completed"],
  },
  {
    name: "pre_prompt_prompt_spec_compose",
    durationKey: "prePromptPromptSpecComposeMs",
    startPhases: ["pre_prompt_prompt_spec_compose_started"],
    endPhases: ["pre_prompt_prompt_spec_compose_completed"],
  },
  {
    name: "pre_prompt_event_stream_subscribe",
    durationKey: "prePromptEventStreamSubscribeMs",
    startPhases: ["pre_prompt_event_stream_subscribe_started"],
    endPhases: ["pre_prompt_event_stream_subscribe_completed"],
  },
  {
    name: "pre_prompt_coworker_docs_stage",
    durationKey: "prePromptCoworkerDocsStageMs",
    startPhases: ["pre_prompt_coworker_docs_stage_started"],
    endPhases: ["pre_prompt_coworker_docs_stage_completed"],
  },
  {
    name: "pre_prompt_attachments_stage",
    durationKey: "prePromptAttachmentsStageMs",
    startPhases: ["pre_prompt_attachments_stage_started"],
    endPhases: ["pre_prompt_attachments_stage_completed"],
  },
  {
    name: "agent_ready_to_prompt",
    durationKey: "agentReadyToPromptMs",
    startPhases: ["agent_init_ready"],
    endPhases: ["prompt_sent"],
  },
  {
    name: "wait_for_first_event",
    durationKey: "waitForFirstEventMs",
    startPhases: ["prompt_sent"],
    endPhases: ["first_event_received"],
  },
  {
    name: "prompt_to_first_token",
    durationKey: "promptToFirstTokenMs",
    startPhases: ["prompt_sent"],
    endPhases: ["first_token_emitted"],
  },
  {
    name: "generation_to_first_token",
    durationKey: "generationToFirstTokenMs",
    startPhases: ["generation_started"],
    endPhases: ["first_token_emitted"],
  },
  {
    name: "prompt_to_first_visible_output",
    durationKey: "promptToFirstVisibleOutputMs",
    startPhases: ["prompt_sent"],
    endPhases: ["first_visible_output_emitted", "first_token_emitted"],
  },
  {
    name: "generation_to_first_visible_output",
    durationKey: "generationToFirstVisibleOutputMs",
    startPhases: ["generation_started"],
    endPhases: ["first_visible_output_emitted", "first_token_emitted"],
  },
  {
    name: "model_stream",
    durationKey: "modelStreamMs",
    startPhases: ["first_event_received"],
    endPhases: ["session_idle", "prompt_completed"],
  },
  {
    name: "post_processing",
    durationKey: "postProcessingMs",
    startPhases: ["post_processing_started"],
    endPhases: ["post_processing_completed"],
  },
];

function getFirstTimestamp(phaseTimes: Map<string, number>, phases: string[] | undefined): number | undefined {
  for (const phase of phases ?? []) {
    const timestamp = phaseTimes.get(phase);
    if (timestamp !== undefined) {
      return timestamp;
    }
  }
  return undefined;
}

function toMicroseconds(ms: number): number {
  return Math.round(ms * 1000);
}

function resolveSpan(
  spec: TracePhaseSpec,
  phaseTimes: Map<string, number>,
  phaseDurations: PhaseDurations | undefined,
): { startMs: number; endMs: number } | null {
  const startMs = getFirstTimestamp(phaseTimes, spec.startPhases);
  const endMs = getFirstTimestamp(phaseTimes, spec.endPhases);

  if (startMs !== undefined && endMs !== undefined && endMs >= startMs) {
    return { startMs, endMs };
  }

  const durationMs = spec.durationKey ? phaseDurations?.[spec.durationKey] : undefined;
  if (durationMs === undefined) {
    return null;
  }

  if (startMs !== undefined) {
    return {
      startMs,
      endMs: startMs + durationMs,
    };
  }

  if (endMs !== undefined) {
    return {
      startMs: endMs - durationMs,
      endMs,
    };
  }

  return null;
}

function getOriginMs(phaseTimes: Map<string, number>): number | null {
  const generationStartedMs = phaseTimes.get("generation_started");
  if (generationStartedMs !== undefined) {
    return generationStartedMs;
  }

  const allTimes = [...phaseTimes.values()];
  if (allTimes.length === 0) {
    return null;
  }

  return Math.min(...allTimes);
}

export function buildChromeTraceFromTiming(args: {
  timing?: TimingData;
  processName?: string;
  threadName?: string;
  pid?: number;
  tid?: number;
}): ChromeTraceBuildResult {
  const phaseTimestamps = args.timing?.phaseTimestamps;
  if (!phaseTimestamps?.length) {
    return { status: "missing_phase_timestamps" };
  }

  const phaseTimes = new Map<string, number>();
  for (const entry of phaseTimestamps) {
    const parsed = Date.parse(entry.at);
    if (!Number.isFinite(parsed)) {
      continue;
    }
    if (!phaseTimes.has(entry.phase)) {
      phaseTimes.set(entry.phase, parsed);
    }
  }

  const originMs = getOriginMs(phaseTimes);
  if (originMs === null) {
    return { status: "missing_phase_timestamps" };
  }

  const pid = args.pid ?? 1;
  const tid = args.tid ?? 1;
  const processName = args.processName ?? "cmdclaw";
  const threadName = args.threadName ?? "chat";
  const traceEvents: ChromeTraceEvent[] = [
    {
      name: "process_name",
      cat: "__metadata",
      ph: "M",
      pid,
      tid,
      ts: 0,
      args: { name: processName },
    },
    {
      name: "thread_name",
      cat: "__metadata",
      ph: "M",
      pid,
      tid,
      ts: 0,
      args: { name: threadName },
    },
  ];

  const phaseDurations = args.timing?.phaseDurationsMs;
  for (const spec of TRACE_PHASE_SPECS) {
    const span = resolveSpan(spec, phaseTimes, phaseDurations);
    if (!span) {
      continue;
    }

    const relativeStartMs = Math.max(0, span.startMs - originMs);
    const durationMs = Math.max(0, span.endMs - span.startMs);
    traceEvents.push({
      name: spec.name,
      cat: "cmdclaw",
      ph: "X",
      pid,
      tid,
      ts: toMicroseconds(relativeStartMs),
      dur: toMicroseconds(durationMs),
      args: {},
    });
  }

  traceEvents.sort((left, right) => {
    if (left.ph !== right.ph) {
      return left.ph === "M" ? -1 : 1;
    }
    if (left.ts !== right.ts) {
      return left.ts - right.ts;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    status: "ok",
    trace: {
      traceEvents,
      displayTimeUnit: "ms",
    },
  };
}
