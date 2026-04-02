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
