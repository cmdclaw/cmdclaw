import { buildPerfettoTraceFromTiming, type DoneArtifactsData } from "@cmdclaw/client";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function buildPerfettoTraceDirectoryPath(cwd: string): string {
  return join(cwd, "perfetto-traces");
}

export function buildPerfettoTraceFilename(date: Date): string {
  return `${date.toISOString().replace(/:/g, "-")}.json`;
}

export function buildPerfettoTraceOutputPath(args: {
  cwd: string;
  now?: Date;
  suffix?: number;
}): string {
  const directoryPath = buildPerfettoTraceDirectoryPath(args.cwd);
  const filename = buildPerfettoTraceFilename(args.now ?? new Date());
  if (!args.suffix || args.suffix <= 1) {
    return join(directoryPath, filename);
  }

  const baseName = filename.slice(0, -".json".length);
  return join(directoryPath, `${baseName}.${args.suffix}.json`);
}

function resolveAvailablePerfettoTraceOutputPath(args: { cwd: string; now?: Date }): string {
  const initialPath = buildPerfettoTraceOutputPath(args);
  if (!existsSync(initialPath)) {
    return initialPath;
  }

  let suffix = 2;
  while (true) {
    const candidatePath = buildPerfettoTraceOutputPath({
      ...args,
      suffix,
    });
    if (!existsSync(candidatePath)) {
      return candidatePath;
    }
    suffix += 1;
  }
}

export function exportPerfettoTraceForCompletedRun(args: {
  cwd: string;
  conversationId: string;
  generationId: string;
  artifacts?: DoneArtifactsData;
  now?: Date;
}):
  | { status: "written"; path: string }
  | { status: "skipped"; reason: "missing_phase_timestamps" } {
  const result = buildPerfettoTraceFromTiming({
    timing: args.artifacts?.timing,
    processName: "cmdclaw chat",
    threadName: `conversation ${args.conversationId} generation ${args.generationId}`,
  });

  if (result.status !== "ok") {
    return {
      status: "skipped",
      reason: "missing_phase_timestamps",
    };
  }

  const directoryPath = buildPerfettoTraceDirectoryPath(args.cwd);
  const outputPath = resolveAvailablePerfettoTraceOutputPath({
    cwd: args.cwd,
    now: args.now,
  });
  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result.trace, null, 2)}\n`, "utf-8");
  return {
    status: "written",
    path: outputPath,
  };
}
