import type { DoneArtifactsData } from "./types";

type TimingData = DoneArtifactsData["timing"];
type PhaseDurations = NonNullable<NonNullable<TimingData>["phaseDurationsMs"]>;

export type PerfettoTraceEvent = {
  name: string;
  cat: string;
  ph: "M" | "X";
  pid: number;
  tid: number;
  ts: number;
  dur?: number;
  args: Record<string, unknown>;
};

export type PerfettoTrace = {
  traceEvents: PerfettoTraceEvent[];
  displayTimeUnit: "ms";
};

export type PerfettoTraceBuildResult =
  | {
      status: "ok";
      trace: PerfettoTrace;
    }
  | {
      status: "missing_phase_timestamps";
    };

type TraceTrackName =
  | "summary"
  | "sandbox_init"
  | "agent_init"
  | "pre_prompt_memory"
  | "pre_prompt_skills"
  | "pre_prompt_integration"
  | "pre_prompt_runtime"
  | "executor_prepare";

const TRACE_TRACKS: TraceTrackName[] = [
  "summary",
  "sandbox_init",
  "agent_init",
  "pre_prompt_memory",
  "pre_prompt_skills",
  "pre_prompt_integration",
  "pre_prompt_runtime",
  "executor_prepare",
];

type TracePhaseSpec = {
  name:
    | "sandbox_init"
    | "sandbox_connect_or_create"
    | "sandbox_create"
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
    | "wait_for_first_event"
    | "prompt_to_first_token"
    | "generation_to_first_token"
    | "prompt_to_first_visible_output"
    | "generation_to_first_visible_output"
    | "model_stream"
    | "post_processing";
  track: TraceTrackName;
  durationKey?: keyof PhaseDurations;
  startPhases?: string[];
  endPhases?: string[];
};

const TRACE_PHASE_SPECS: TracePhaseSpec[] = [
  {
    name: "sandbox_init",
    track: "sandbox_init",
    durationKey: "sandboxInitMs",
    startPhases: ["sandbox_init_started"],
    endPhases: ["agent_init_started"],
  },
  {
    name: "sandbox_connect_or_create",
    track: "sandbox_init",
    durationKey: "sandboxConnectOrCreateMs",
    startPhases: ["sandbox_init_checking_cache", "sandbox_init_started"],
    endPhases: ["sandbox_init_reused", "sandbox_init_created"],
  },
  {
    name: "sandbox_create",
    track: "sandbox_init",
    durationKey: "sandboxCreateMs",
    startPhases: ["sandbox_init_creating"],
    endPhases: ["sandbox_init_created"],
  },
  {
    name: "opencode_ready",
    track: "agent_init",
    durationKey: "opencodeReadyMs",
    startPhases: ["agent_init_opencode_starting", "agent_init_started"],
    endPhases: ["agent_init_opencode_ready"],
  },
  {
    name: "session_ready",
    track: "agent_init",
    durationKey: "sessionReadyMs",
    startPhases: ["agent_init_session_creating", "agent_init_started"],
    endPhases: ["agent_init_session_init_completed", "agent_init_session_reused"],
  },
  {
    name: "agent_init",
    track: "agent_init",
    durationKey: "agentInitMs",
    startPhases: ["agent_init_started"],
    endPhases: ["agent_init_ready"],
  },
  {
    name: "pre_prompt_setup",
    track: "summary",
    durationKey: "prePromptSetupMs",
    startPhases: ["pre_prompt_setup_started"],
    endPhases: ["prompt_sent"],
  },
  {
    name: "pre_prompt_memory_sync",
    track: "pre_prompt_memory",
    durationKey: "prePromptMemorySyncMs",
    startPhases: ["pre_prompt_memory_sync_started"],
    endPhases: ["pre_prompt_memory_sync_completed"],
  },
  {
    name: "pre_prompt_runtime_context_write",
    track: "pre_prompt_runtime",
    durationKey: "prePromptRuntimeContextWriteMs",
    startPhases: ["pre_prompt_runtime_context_write_started"],
    endPhases: ["pre_prompt_runtime_context_write_completed"],
  },
  {
    name: "pre_prompt_executor_prepare",
    track: "executor_prepare",
    durationKey: "prePromptExecutorPrepareMs",
    startPhases: ["pre_prompt_executor_prepare_started"],
    endPhases: ["pre_prompt_executor_prepare_completed"],
  },
  {
    name: "pre_prompt_executor_bootstrap_load",
    track: "executor_prepare",
    durationKey: "prePromptExecutorBootstrapLoadMs",
    startPhases: ["pre_prompt_executor_bootstrap_load_started"],
    endPhases: ["pre_prompt_executor_bootstrap_load_completed"],
  },
  {
    name: "pre_prompt_executor_config_write",
    track: "executor_prepare",
    durationKey: "prePromptExecutorConfigWriteMs",
    startPhases: ["pre_prompt_executor_config_write_started"],
    endPhases: ["pre_prompt_executor_config_write_completed"],
  },
  {
    name: "pre_prompt_executor_server_probe",
    track: "executor_prepare",
    durationKey: "prePromptExecutorServerProbeMs",
    startPhases: ["pre_prompt_executor_server_probe_started"],
    endPhases: ["pre_prompt_executor_server_probe_completed"],
  },
  {
    name: "pre_prompt_executor_server_wait_ready",
    track: "executor_prepare",
    durationKey: "prePromptExecutorServerWaitReadyMs",
    startPhases: ["pre_prompt_executor_server_wait_ready_started"],
    endPhases: ["pre_prompt_executor_server_wait_ready_completed"],
  },
  {
    name: "pre_prompt_executor_status_check",
    track: "executor_prepare",
    durationKey: "prePromptExecutorStatusCheckMs",
    startPhases: ["pre_prompt_executor_status_check_started"],
    endPhases: ["pre_prompt_executor_status_check_completed"],
  },
  {
    name: "pre_prompt_executor_oauth_reconcile",
    track: "executor_prepare",
    durationKey: "prePromptExecutorOauthReconcileMs",
    startPhases: ["pre_prompt_executor_oauth_reconcile_started"],
    endPhases: ["pre_prompt_executor_oauth_reconcile_completed"],
  },
  {
    name: "pre_prompt_skills_and_creds_load",
    track: "pre_prompt_skills",
    durationKey: "prePromptSkillsAndCredsLoadMs",
    startPhases: ["pre_prompt_skills_and_creds_load_started"],
    endPhases: ["pre_prompt_skills_and_creds_load_completed"],
  },
  {
    name: "pre_prompt_cache_read",
    track: "pre_prompt_runtime",
    durationKey: "prePromptCacheReadMs",
    startPhases: ["pre_prompt_cache_read_started"],
    endPhases: ["pre_prompt_cache_read_completed"],
  },
  {
    name: "pre_prompt_skills_write",
    track: "pre_prompt_skills",
    durationKey: "prePromptSkillsWriteMs",
    startPhases: ["pre_prompt_skills_write_started"],
    endPhases: ["pre_prompt_skills_write_completed"],
  },
  {
    name: "pre_prompt_custom_integration_cli_write",
    track: "pre_prompt_integration",
    durationKey: "prePromptCustomIntegrationCliWriteMs",
    startPhases: ["pre_prompt_custom_integration_cli_write_started"],
    endPhases: ["pre_prompt_custom_integration_cli_write_completed"],
  },
  {
    name: "pre_prompt_custom_integration_permissions_write",
    track: "pre_prompt_integration",
    durationKey: "prePromptCustomIntegrationPermissionsWriteMs",
    startPhases: ["pre_prompt_custom_integration_permissions_write_started"],
    endPhases: ["pre_prompt_custom_integration_permissions_write_completed"],
  },
  {
    name: "pre_prompt_integration_skills_write",
    track: "pre_prompt_integration",
    durationKey: "prePromptIntegrationSkillsWriteMs",
    startPhases: ["pre_prompt_integration_skills_write_started"],
    endPhases: ["pre_prompt_integration_skills_write_completed"],
  },
  {
    name: "pre_prompt_cache_write",
    track: "pre_prompt_runtime",
    durationKey: "prePromptCacheWriteMs",
    startPhases: ["pre_prompt_cache_write_started"],
    endPhases: ["pre_prompt_cache_write_completed"],
  },
  {
    name: "pre_prompt_prompt_spec_compose",
    track: "pre_prompt_runtime",
    durationKey: "prePromptPromptSpecComposeMs",
    startPhases: ["pre_prompt_prompt_spec_compose_started"],
    endPhases: ["pre_prompt_prompt_spec_compose_completed"],
  },
  {
    name: "pre_prompt_event_stream_subscribe",
    track: "pre_prompt_runtime",
    durationKey: "prePromptEventStreamSubscribeMs",
    startPhases: ["pre_prompt_event_stream_subscribe_started"],
    endPhases: ["pre_prompt_event_stream_subscribe_completed"],
  },
  {
    name: "pre_prompt_coworker_docs_stage",
    track: "pre_prompt_runtime",
    durationKey: "prePromptCoworkerDocsStageMs",
    startPhases: ["pre_prompt_coworker_docs_stage_started"],
    endPhases: ["pre_prompt_coworker_docs_stage_completed"],
  },
  {
    name: "pre_prompt_attachments_stage",
    track: "pre_prompt_runtime",
    durationKey: "prePromptAttachmentsStageMs",
    startPhases: ["pre_prompt_attachments_stage_started"],
    endPhases: ["pre_prompt_attachments_stage_completed"],
  },
  {
    name: "wait_for_first_event",
    track: "summary",
    durationKey: "waitForFirstEventMs",
    startPhases: ["prompt_sent"],
    endPhases: ["first_event_received"],
  },
  {
    name: "prompt_to_first_token",
    track: "summary",
    durationKey: "promptToFirstTokenMs",
    startPhases: ["prompt_sent"],
    endPhases: ["first_token_emitted"],
  },
  {
    name: "generation_to_first_token",
    track: "summary",
    durationKey: "generationToFirstTokenMs",
    startPhases: ["generation_started"],
    endPhases: ["first_token_emitted"],
  },
  {
    name: "prompt_to_first_visible_output",
    track: "summary",
    durationKey: "promptToFirstVisibleOutputMs",
    startPhases: ["prompt_sent"],
    endPhases: ["first_visible_output_emitted", "first_token_emitted"],
  },
  {
    name: "generation_to_first_visible_output",
    track: "summary",
    durationKey: "generationToFirstVisibleOutputMs",
    startPhases: ["generation_started"],
    endPhases: ["first_visible_output_emitted", "first_token_emitted"],
  },
  {
    name: "model_stream",
    track: "summary",
    durationKey: "modelStreamMs",
    startPhases: ["first_event_received"],
    endPhases: ["session_idle", "prompt_completed"],
  },
  {
    name: "post_processing",
    track: "summary",
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

function buildTrackTidMap(baseTid: number): Map<TraceTrackName, number> {
  return new Map(TRACE_TRACKS.map((trackName, index) => [trackName, baseTid + index]));
}

export function buildPerfettoTraceFromTiming(args: {
  timing?: TimingData;
  processName?: string;
  threadName?: string;
  pid?: number;
  tid?: number;
}): PerfettoTraceBuildResult {
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
  const baseTid = args.tid ?? 1;
  const processName = args.processName ?? "cmdclaw";
  const traceEvents: PerfettoTraceEvent[] = [
    {
      name: "process_name",
      cat: "__metadata",
      ph: "M",
      pid,
      tid: baseTid,
      ts: 0,
      args: { name: processName },
    },
  ];
  const trackTidMap = buildTrackTidMap(baseTid);
  for (const trackName of TRACE_TRACKS) {
    const tid = trackTidMap.get(trackName);
    if (tid === undefined) {
      continue;
    }
    traceEvents.push({
      name: "thread_name",
      cat: "__metadata",
      ph: "M",
      pid,
      tid,
      ts: 0,
      args: { name: trackName },
    });
  }

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
      tid: trackTidMap.get(spec.track) ?? baseTid,
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
