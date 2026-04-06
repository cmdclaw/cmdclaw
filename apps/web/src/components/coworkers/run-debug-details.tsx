"use client";

import { cn } from "@/lib/utils";

type RunDebugDetailsProps = {
  className?: string;
  debugInfo: unknown;
  fallbackTimestamp?: Date | string | null;
};

function formatDebugTimestamp(value?: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString();
}

export function RunDebugDetails({ className, debugInfo, fallbackTimestamp }: RunDebugDetailsProps) {
  if (!debugInfo || typeof debugInfo !== "object") {
    return null;
  }

  const data = debugInfo as Record<string, unknown>;
  const originalErrorMessage =
    typeof data.originalErrorMessage === "string" ? data.originalErrorMessage : null;
  const originalErrorPhase =
    typeof data.originalErrorPhase === "string" ? data.originalErrorPhase : null;
  const originalErrorAt = typeof data.originalErrorAt === "string" ? data.originalErrorAt : null;
  const runtimeFailure = typeof data.runtimeFailure === "string" ? data.runtimeFailure : null;
  const recordedAt = formatDebugTimestamp(originalErrorAt ?? fallbackTimestamp ?? null);
  const timestampLabel = originalErrorAt ? "Occurred at:" : "Recorded at:";

  return (
    <details className={cn("mt-3 rounded-lg border border-dashed px-3 py-2", className)}>
      <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
        Technical details
      </summary>
      <div className="mt-2 space-y-1">
        {recordedAt ? (
          <p className="text-xs">
            <span className="text-muted-foreground">{timestampLabel}</span> {recordedAt}
          </p>
        ) : null}
        {originalErrorMessage ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Original error:</span> {originalErrorMessage}
          </p>
        ) : null}
        {originalErrorPhase ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Phase:</span> {originalErrorPhase}
          </p>
        ) : null}
        {runtimeFailure ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Runtime failure:</span> {runtimeFailure}
          </p>
        ) : null}
        <pre className="bg-muted/40 overflow-x-auto rounded-md p-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </div>
    </details>
  );
}
