import { buildChromeTraceFromTiming, type DoneArtifactsData } from "@cmdclaw/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";

export function buildChromeTraceOutputPath(basePath: string, exportIndex: number): string {
  if (exportIndex <= 1) {
    return basePath;
  }

  const extension = extname(basePath);
  if (!extension) {
    return `${basePath}.${exportIndex}`;
  }

  const baseWithoutExtension = basePath.slice(0, -extension.length);
  return `${baseWithoutExtension}.${exportIndex}${extension}`;
}

export function exportChromeTraceForCompletedRun(args: {
  basePath: string;
  exportIndex: number;
  conversationId: string;
  generationId: string;
  artifacts?: DoneArtifactsData;
}):
  | { status: "written"; path: string }
  | { status: "skipped"; reason: "missing_phase_timestamps" } {
  const result = buildChromeTraceFromTiming({
    timing: args.artifacts?.timing,
    processName: "cmdclaw chat",
    threadName: `conversation ${args.conversationId} generation ${args.generationId}`,
    tid: args.exportIndex,
  });

  if (result.status !== "ok") {
    return {
      status: "skipped",
      reason: "missing_phase_timestamps",
    };
  }

  const outputPath = buildChromeTraceOutputPath(args.basePath, args.exportIndex);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result.trace, null, 2)}\n`, "utf-8");
  return {
    status: "written",
    path: outputPath,
  };
}
